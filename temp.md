下面给一套“能真正把 `values.length` 降下来 + 降低写回负担”的落地方案。核心思路是：**把通道表从“一属性一输出”升级为“两层：rawChannels(插值用) → outputChannels(读回用)”**，并在 output‑format pass 里做**压缩/打包**，CPU 侧按 `formatType` **解包+批量写回**。

---

## **目标拆解**
1) **readback 体积下降（values.length 下降）**
必须让 `table.rawStride > table.stride` 成立（raw 输出更宽，readback 更窄）。

2) **写回负担下降**
CPU 侧避免“逐 channel、逐 property 的散写”，对常见布局（standard transform / packed transform / packed color）做**固定布局 fast-path**。

---

## **方案总览**
### A. 通道表（Channel Table）成为压缩的“契约”
继续沿用现有结构（已经支持）：
- `rawChannels/rawStride`：插值阶段输出的通道布局（可能很宽，例如 RGBA=4、matrix=6/16）
- `channels/stride`：output-format pass 之后的读回布局（可能更窄，例如 RGBA packed=1、matrix half-pack=3/8）

落地方式：
- 对需要压缩的属性，注册 `BatchChannelTable` 时**明确设置**：
  - `rawChannels` + `rawStride`
  - `channels` + `stride`
  - `channels[i].sourceIndex` 指向 raw 的起始索引
  - `channels[i].formatType` 指示 output-format shader 如何从 raw 生成 output

你现在的流水线已经能跑通这个契约（`rawStride/outputStride` 已贯通），缺的就是“生成这种表”。

---

## **B. 颜色：RGBA(4) → packed u32(1)，真正让 values.length 变小**
### 1) 让 GPU 侧拥有 RGBA 四通道的 keyframes
当前系统里 GPU 只处理数值 track；颜色 track（例如 `'color'`、`'backgroundColor'`）没有拆成 4 个数值通道，所以 shader 的 `FORMAT_COLOR_RGBA` 没法用。

落地策略（推荐在 animation 层做）：
- 在 builder / timeline 预处理阶段，把一个颜色属性 track 展开成 4 个数值 track：
  - `color.__r`, `color.__g`, `color.__b`, `color.__a`
- keyframe 的 start/end 值都转换为线性空间 0..1（或 0..255，二选一但要一致），这样插值是数值插值。

### 2) 注册压缩通道表（rawStride=4 → stride=1）
举例：`backgroundColor`
- `rawChannels`：4 条（r/g/b/a），`rawStride=4`
- `channels`：1 条（property=`backgroundColor`），`stride=1`
  - `sourceIndex=0`（从 r 开始）
  - `formatType=OUTPUT_FORMAT.COLOR_RGBA`
  - `minValue/maxValue` 按你选的数值范围设置（0..1 或 0..255）

### 3) CPU 写回
你已经实现了 `COLOR_RGBA` 的 packed 解码并写 CSS（`packedRGBAToCSS` + `formatType` 分支）。所以颜色这块的 CPU 侧基本够用，只要通道表生成到位即可。

**效果**：一个颜色属性从“4 floats 读回”变成“1 float（承载 bitcast u32）读回”，`values.length` 直接缩 4 倍（对颜色属性部分）。

---

## **C. Transform：把 6 float 压到 3（half2 pack），readback 体积减半**
你提出的“matrix 一次性输出，CPU 拆”本质上有两种收益：
- **读回体积**：用 FP16/bit-pack 才能真的变小
- **写回负担**：用固定布局 fast-path 才能减少 CPU 散写

推荐落地的压缩形态（最现实、收益稳定）：
- 仍然以标准 2D transform 的 6 个标量为 raw（x,y,rotate,scaleX,scaleY,opacity）
- output-format pass 把 6 个 f32 **两两打包成 3 个 u32**（half-float *2）：
  - pack(x,y), pack(rotate,scaleX), pack(scaleY,opacity)
- 读回 stride 从 6 → 3，体积减半。

需要补的实现点：
1) **在 output-format shader 里增加“half2 pack”输出格式**
   - 新增 `OUTPUT_FORMAT.PACKED_HALF2`（或专用于 `MATRIX_2D_PACKED`，名字随你）
   - WGSL 里复用你项目已有的 half-float pack 逻辑（keyframe preprocess shader 已有 `floatToHalfBits/packHalfs`，可直接搬）
2) **通道表生成**
   - `rawChannels`：6（现状就有）
   - `channels`：3（packed），每个 channel 从 raw 起始 index 读取两项
3) **GPUResultApplySystem 解包 + fast-path 写回**
   - 当检测到该表是 packed transform（例如 `table.kind==='standardTransform'` 且 `stride===3` 或 `formatType` 匹配），走一条固定解包路径：
     - 先把 3 个 u32 解成 6 个 f32
     - 直接写 typed Transform buffers（x/y/rotateZ/scaleX/scaleY/opacity），避免逐 channel loop + 多次 Map 查找

**效果**：标准 transform 的读回体积减半，同时 CPU 写回更连续、更少分支。

> 如果你坚持“真正输出 matrix”，那 matrix 本身 2D 也是 6 标量，不做 packing 并不会让 `values.length` 下降；它更多是写回语义上的组织方式。建议先用 half-pack 拿到确定的带宽收益。

---

## **D. “primitive 值的 renderer 保持 stride=1”**
这里要先把“primitive”的含义做成可判定的**数据契约**，否则系统没法自动决定降维。

推荐两条路径，二选一或同时支持：

1) **显式声明（推荐）**
在 RenderComponent 或 renderer 注册里加一个 flag，例如：
- `render.resultMode = 'primitive'`
或 renderer metadata：
- `renderer.capabilities = { primitiveOnly: true }`

BatchSamplingSystem / channel table 注册阶段看到该 flag，就给这个 archetype 注册：
- `channels=[{property:'__primitive', index:0}]`
- `stride=1`
这样 GPUResultApplySystem 现有 primitive fast-path 就能稳定命中。

2) **隐式判定（保守）**
如果一个实体（或某 archetype）所有 GPU track 只有一个，并且 property 是 `__primitive` 或者 rendererId 属于某白名单，则自动用 stride=1。
这条要非常谨慎，避免把本该多通道的渲染器误判成单通道。

---

## **E. 验证与回归测试（必须补）**
新增/调整测试点，保证“压缩真生效”：
- output-format pass：rawStride→outputStride 时 `byteSize/stride` 计算正确（防止截断/错位）
- COLOR_RGBA：
  - raw 4 通道输入 → packed 输出 → CPU 解码 CSS 一致
  - `values.length === entityCount * 1`
- packed transform：
  - raw 6 通道 → packed 3 → CPU 解包还原误差可接受
  - fast-path 写入 typed buffers 正确

---

## **实施顺序（建议）**
1) 先做 **颜色 RGBA→packed(1)**：收益大、语义清晰、CPU 已有解包分支
2) 再做 **standard transform half-pack(6→3) + fast-path 写回**：收益稳定、对整体动画带宽影响最大
3) 最后再考虑“输出 matrix 语义”或更激进的压缩（例如更高阶 bit-pack/量化）

如果你认可这套方案，我下一步可以按这个顺序把具体改动点拆到文件级别（builder/timeline 展开颜色通道、output-format shader 新格式、channel table 生成、GPUResultApplySystem fast-path + 解包），并把对应测试补齐。

## 1. Implementation
- [x] 1.1 拆分 output-buffer-processing 为三段式管线（format/copy/readback）
- [x] 1.2 readback 超时与排队深度指标接入 metrics provider
- [x] 1.3 视口裁剪 pass 分离 CPU 采集与 GPU 计算
- [x] 1.4 WebGPUEngine 注入 readback/metrics 管理器，减少全局依赖
- [x] 1.5 更新调用链路与类型定义

## 2. Tests
- [x] 2.1 输出格式化路径单测（通道映射与跳过逻辑）
- [x] 2.2 readback 超时与过期路径单测
- [x] 2.3 视口裁剪 CPU 采集与 GPU pass 分离后回归测试

## 3. Benchmarks
- [x] 3.1 输出处理链路基准（format+copy+readback）
- [x] 3.2 culling 采集与 GPU pass 分离前后 CPU 成本对比

## 1. Implementation
- [x] 1.1 修复批处理清理路径并释放缓存
- [x] 1.2 补齐实体删除与 EntityManager 同步
- [x] 1.3 提炼 GPU 结果应用公共路径并去重
- [x] 1.4 统一调度时间源与时间戳采样
- [x] 1.5 收敛 shader 注册入口并移除 globalThis 依赖
- [x] 1.6 拆分超大文件与调整模块边界

## 2. Tests
- [ ] 2.1 批处理清理与缓存释放单测
- [ ] 2.2 实体删除一致性单测
- [ ] 2.3 GPU 结果应用一致性回归测试

## 3. Benchmarks
- [ ] 3.1 GPU 结果应用路径前后基准对比

## 4. Validation
- [x] 4.1 运行核心包测试
- [x] 4.2 运行 lint 与 type-check

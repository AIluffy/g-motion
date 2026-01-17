## 1. Implementation
- [ ] 移除 GPU/CPU 切换配置与对外 API（仅保留 GPU-only）
- [ ] 将 WebGPU 初始化改为 fail-fast，删除自动降级逻辑
- [ ] 移除 CPU 插值兜底系统与相关调度/注册
- [ ] 清理 CPU fallback 相关 metrics/status 与错误恢复策略
- [ ] 更新测试与基准：删除 CPU vs GPU 对照，补充 GPU-only 验证

## 2. Validation
- [ ] `pnpm lint`
- [ ] `pnpm type-check`
- [ ] `pnpm test`

# 04: 打 tag 自动同步插件市场

**What to build:** 让版本 tag 触发 CI 自动运行统一构建与插件市场同步，把新版本推送到 fork 的目标分支并自动刷新现有 PR；Release 流程保持独立，官方同步失败不会伪装成成功。

**Blocked by:** 01: 统一构建双产物；02: 一键同步官方目录 fork。

**Status:** ready-for-agent

- [ ] 版本 tag 能触发统一构建、插件市场校验和 fork 同步，使用与本地命令相同的产物
- [ ] 提供不发布版本的手动试跑入口，用于验证 workflow 与权限配置
- [ ] workflow 使用最小范围的 fine-grained PAT，只能写入目标 fork 的 Contents；凭证不出现在日志或产物中
- [ ] CI 推送固定目标分支，使已有 PR 自动获得新 commit；不承诺自动替维护者批准或 merge
- [ ] 任一步骤失败都返回失败状态并给出明确诊断；Release workflow 不被错误标记为成功
- [ ] 文档说明 tag 触发方式、PAT 权限、首次配置和常见失败恢复方式
- [ ] CI 配置通过静态检查，并用无凭证的 dry-run 或手动试跑验证核心路径

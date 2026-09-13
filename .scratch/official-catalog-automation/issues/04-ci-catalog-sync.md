# 04: 打 tag 自动同步插件市场

**What to build:** 让版本 tag 触发 CI 自动运行统一构建与插件市场同步，把新版本推送到 fork 的目标分支并自动刷新现有 PR；Release 流程保持独立，官方同步失败不会伪装成成功。

**Blocked by:** 01: 统一构建双产物；02: 一键同步官方目录 fork。

**Status:** done

- [x] 版本 tag 能触发统一构建、插件市场校验和 fork 同步，使用与本地命令相同的产物（`catalog-sync.yml` 复用 `npm run package:plugin`）
- [x] 提供不发布版本的手动试跑入口（`workflow_dispatch`，可自定义目标分支）
- [x] workflow 使用最小范围的 fine-grained PAT，只能写入目标 fork 的 Contents；源仓 checkout `persist-credentials: false`，token 仅用于 fork 克隆 URL，由 GitHub 日志掩码
- [x] CI 推送固定目标分支（默认 `feat/langfuse-observability`），推送后校验远端 head 与本地一致；已有 PR 自动获得新 commit；不承诺自动替维护者批准或 merge
- [x] 任一步骤失败都返回失败状态并给出明确诊断；Catalog sync 与 Release 互相独立，官方同步失败不会伪装成 Release 成功
- [x] 文档说明 tag 触发方式、PAT 权限、首次配置和常见失败恢复方式（`docs/releasing.md` Automatic catalog sync 节）
- [x] CI 配置通过静态检查（yaml-parse OK）并用无凭证试跑验证核心路径（clone → identity → sync → push → head 校验逐句一致，同步为幂等 no-op）；真实 CI 运行待 `CATALOG_SYNC_PAT` 配置后用 `workflow_dispatch` 验证

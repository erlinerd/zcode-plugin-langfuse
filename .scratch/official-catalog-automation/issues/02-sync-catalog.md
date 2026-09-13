# 02: 一键同步插件市场 fork

**What to build:** 让维护者把已验证的插件市场布局同步到 erlinerd/zcode-plugins 的目标分支，并以可审阅的 commit 更新现有 PR；重复执行安全，推送前不会发布未通过校验的内容。

**Blocked by:** 01: 统一构建双产物。

**Status:** done

- [x] 同步命令接收统一构建产物并更新目标 fork 分支，不需要手工复制文件
- [x] `--dry-run` 只展示将执行的文件与 git 操作，不创建 commit、不推送
- [x] 实际同步前强制运行插件市场校验；校验失败时不 commit、不 push，并给出可行动错误
- [x] 同一版本重复运行保持幂等，不产生无意义 commit 或破坏目标分支
- [x] 本地 fork clone 缺失、分支状态不适合同步或远端认证失败时明确停止并给出恢复指引
- [x] commit 信息包含插件版本；smoke test 证明同步内容可提交到目标分支（本地 bare remote push 实测；真实 fork 首次同步在工单 03 执行）
- [x] 在同步命令的 dry-run 接缝增加测试，不触碰真实凭证或网络推送

# 03: 将 PR #11 切换为 bundle 版

**What to build:** 让插件市场 PR #11 展示与统一构建一致的 bundle 版插件，并把提交说明改成诚实、可审阅的构建产物方案，使维护者能直接复核版本、布局和先例依据。

**Blocked by:** 01: 统一构建双产物。

**Status:** done

- [x] PR #11 目标目录内容与统一构建产物完全一致，包含正确版本与插件市场布局（`diff -r` 逐字节一致）
- [x] PR 中不保留会漂移的手工源码副本或上一版本构建文件（旧 `hooks/*.mjs` 快照已删除）
- [x] PR 描述撤回不再适用的“no generated bundles”承诺，并明确说明 bundle 来源、透明生成标记与 mimosa 先例
- [x] PR head 通过插件市场校验器（`OK: 20 plugin(s) validated`）与本仓库的 artifact 校验
- [x] PR 更新过程不暴露凭证、真实 Hook payload、prompt 或 transcript
- [x] 记录 PR 更新后的 commit（`be45559` 布局替换、`7d139b6` 补入被 gitignore 吞掉的 bundle）、校验命令和剩余的人工审阅风险（机器过关 ≠ 会被合并，审阅仍由官方维护者执行）

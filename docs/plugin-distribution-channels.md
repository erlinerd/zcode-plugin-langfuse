# ZCode 插件分发生态调研笔记

> 内部维护者参考。2026-09-13，基于本机实测与上游仓库取证（非猜测）。
> 背景：插件改名 v0.2.0 后，讨论"官方目录双载体同步"如何处理。

## 四个生态的插件形态

| 生态 | 插件形态 | 构建？ | 依赖安装？ | 消化方式 |
| --- | --- | --- | --- | --- |
| **pi** | TS 源码直发（`files: ["src"]`，无 dist） | ❌ | ✅ npm install | 运行时类型剥离 |
| **Codex** | rolldown bundle（`dist/index.mjs`，OTel 内联 2MB） | ✅ | 内联 | 发布者构建，npm tarball 交付 |
| **ZCode ZIP 通道** | esbuild bundle（`dist/hooks/entry.mjs`） | ✅ | 内联 | 发布者构建（本仓库现状） |
| **ZCode 官方目录** | 零构建纯 JS 源码入树 | ❌ | ❌ 零依赖 | 作者手写 JS |

规律：**集成方式跟随分发通道**——能装依赖的通道（npm/uv）用官方 SDK；不能装的（zip/源码）用原生 fetch 直打 ingestion API。Langfuse 官方自己就是"每平台一个集成、同一 ingestion 协议"的实践者。

## 官方目录（zai-org/zcode-plugins）规则实证

- `scripts/validate.py` 硬规则（L167-174）：条目 `source` 必须精确等于 `./plugins/<name>`——目录必须存在、名字匹配、不可越界。**URL/zip 引用条目无法通过校验。**
- main 分支 19 个条目 100% 入树源码，0 个链接引用；多数插件零构建零依赖（lark-cli 仅 manifest + README + SKILL.md）。
- 大小上限：单插件 5000 文件 / 256MB（构建产物放进去机器能过，但见下）。
- 审阅 = 纯人工（仓库不跑 CI）。**机器过关 ≠ 会被合并**：150KB 生成 blob 无人能审，且违背 PR #11 已承诺的 "generated bundles are not committed"。
- 现实通道：社区 PR 9 open / 0 merged（截至 2026-09-13）；实际架上架走 z.ai 内部 bot 管线直推。**官方通道对社区作者的期望值 = 待审队列。**

## 本仓库的双载体模型（现状）

```text
仓库① 源码仓库 zcode-plugin-langfuse
      TS + 官方 SDK + esbuild → Release ZIP（v0.2.0，自成分发通道）
仓库② fork erlinerd/zcode-plugins（分支 feat/langfuse-observability）
      纯 JS 源码副本 → PR zai-org/zcode-plugins#11（0.2.0 已同步，冻结等审）
```

- 同一逻辑两种载体；同步 = 人工翻写/校对 ~1000 行 + 官方 validate.py 自检。
- **决策（2026-09-13）：冻结随缘。** PR #11 保持 open 快照，不主动跟进；仅当出现维护者动静时手动同步一次。理由：官方通道价值未证实（0 merged 先例），本仓分发不依赖它。
- 首开 PR 后，后续版本 push 同一分支即自动更新 PR；**merge 之后**的新版本才需要开新 PR。

## Langfuse 官方自身实践（可抄的模板）

- Codex 插件（langfuse/codex-observability-plugin）：pnpm monorepo，`prepack: pnpm -w run build`（tsdown/rolldown 打包 OTel 内联）→ **npm publish 交付**，dist 永不进 git。git marketplace 条目只做发现，交付走 npm tarball。
- pi 插件（@langfuse/pi-observability-plugin）：`files: ["src"]` 直发 TS 源码，OpenTelemetry 依赖走 npm。
- 结论：发布边界自动构建 + 交付通道决定形态，**没有"一份源码通吃"的银弹**。

## 已验证的坑

1. Langfuse 自建实例摄入管道有秒~分级延迟：发布后立刻查 API 会误判失败，先等再查。
2. `langfuse.erlinerd.com` 的 Cloudflare WAF 按 UA 拦 Python-urllib（读 API 403，curl UA 200，凭证无关）。python 直读需伪装 curl UA；SDK 发布不受影响。
3. pi TUI 的 mermaid 用自研 grok-mermaid 渲染（非 mermaid.js）；图宽超过终端可用列数会静默回退显示原文。

## 待修文档漂移

- `docs/releasing.md` Publish 节描述"官方目录条目引用 ZIP-URL + sha256"，与现实（源码入树 PR）不符，待改为实际流程。

## 若未来要自动化（选项存档，均未实施）

前提：sink 改为「SDK 动态可选导入 + fetch 兜底」双策略（官方副本已验证此形态），构建新增 tsc 直出扁平 .mjs 出口。此后：

1. 本地脚本 `sync-official`：构建 → 复制入 fork → commit → push（每次发版 +1 分钟）。
2. CI 全自动：tag 触发 workflow 跨仓推送（需 fork 的 fine-grained PAT，contents:write）。
3. 或提 issue 问 zai-org 能否放宽为 ZIP-URL 条目（先例看希望渺茫，但成本仅 10 分钟）。

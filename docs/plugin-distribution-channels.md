# ZCode 插件分发生态调研笔记

> 内部维护者参考。2026-09-13，基于本机实测与上游仓库取证（非猜测）。
> 背景：插件改名 v0.2.0 后，讨论"官方目录双载体同步"如何处理。

## 四个生态的插件形态

| 生态 | 插件形态 | 构建？ | 依赖安装？ | 消化方式 |
| --- | --- | --- | --- | --- |
| **pi** | TS 源码直发（`files: ["src"]`，无 dist） | ❌ | ✅ npm install | 运行时类型剥离 |
| **Codex** | rolldown bundle（`dist/index.mjs`，OTel 内联 2MB） | ✅ | 内联 | 发布者构建，npm tarball 交付 |
| **ZCode ZIP 通道** | esbuild bundle（`hooks/entry.mjs`，官方模板布局） | ✅ | 内联 | 发布者构建（本仓库现状） |
| **ZCode 官方目录** | plugin layout（官方模板同构；mimosa payload 为另一构建产物先例） | 可选 | ❌ 零依赖 | 目录规则校验 + 人工审阅 |

规律：**集成方式跟随分发通道**——能装依赖的通道（npm/uv）用官方 SDK；不能装的（zip/源码）用原生 fetch 直打 ingestion API。Langfuse 官方自己就是"每平台一个集成、同一 ingestion 协议"的实践者。

## 官方目录（zai-org/zcode-plugins）规则实证

- `scripts/validate.py` 硬规则（L167-174）：条目 `source` 必须精确等于 `./plugins/<name>`——目录必须存在、名字匹配、不可越界。**URL/zip 引用条目无法通过校验。**
- `scripts/validate.py` 仍要求条目 `source` 精确为 `./plugins/<name>`，并检查目录存在、名字匹配、不可越界。
- main 分支大多数条目是源码形态，但 mimosa 1.0.3 是已上架的构建产物例外：`payload/` 含约 6.2MB 密封 bundle。
- 大小上限：单插件 5000 文件 / 256MB；构建产物在机器规则上可通过，但机器过关不等于维护者会合并。
- 审阅仍主要靠人工；bundle 透明度、生成来源标记、PR 描述诚实度和维护者偏好都会影响结果。
- 社区 PR 仍可能长期等待审阅；本仓库的 Release ZIP 分发不依赖官方目录 merge。

## 本仓库的双载体模型（现状）

```text
仓库① 源码仓库 zcode-plugin-langfuse
      TS + 官方 SDK + esbuild → npm run package:plugin
      ├─ Release ZIP（自成分发通道）
      └─ dist/（ZCode 市场树：本地安装 + 官方目录同步输入）
仓库② fork erlinerd/zcode-plugins（分支 feat/langfuse-observability）
      plugin layout → PR zai-org/zcode-plugins#11
```

- 两种载体共用一次 runtime bundle；默认分发构建同时产出 ZIP 与 plugin layout，避免人工翻写源码副本。
- 2026-09-13 晚起 dist 定型为「市场壳 + 内层官方模板布局」：`dist/marketplace.json`（source `./plugins/<name>`）+ `dist/plugins/<name>/`（`.zcode-plugin/` + `.claude-plugin/` 副本 + `hooks/hooks.json` → `hooks/entry.mjs` 密封 bundle + 双语 README + LICENSE + notices，无 payload/、无 artifact 内 package.json）。安装进 ZCode 缓存的就是内层目录，与 example-plugin 逐文件同构。
- PR #11 的内容切换为 bundle 版是一次性 rollout；后续同步由 `sync-catalog` 与 tag workflow 承担，merge 仍由维护者决定。
- 首开 PR 后，后续版本 push 同一分支即可自动更新 PR；**merge 之后**的新版本才需要开新 PR。

## Langfuse 官方自身实践（可抄的模板）

- Codex 插件（langfuse/codex-observability-plugin）：pnpm monorepo，`prepack: pnpm -w run build`（tsdown/rolldown 打包 OTel 内联）→ **npm publish 交付**，dist 永不进 git。git marketplace 条目只做发现，交付走 npm tarball。
- pi 插件（@langfuse/pi-observability-plugin）：`files: ["src"]` 直发 TS 源码，OpenTelemetry 依赖走 npm。
- 结论：发布边界自动构建 + 交付通道决定形态，**没有"一份源码通吃"的银弹**。

## 已验证的坑

1. Langfuse 自建实例摄入管道有秒~分级延迟：发布后立刻查 API 会误判失败，先等再查。
2. `langfuse.erlinerd.com` 的 Cloudflare WAF 按 UA 拦 Python-urllib（读 API 403，curl UA 200，凭证无关）。python 直读需伪装 curl UA；SDK 发布不受影响。
3. pi TUI 的 mermaid 用自研 grok-mermaid 渲染（非 mermaid.js）；图宽超过终端可用列数会静默回退显示原文。

## 文档状态

- `docs/releasing.md` 已改为描述 ZIP 与 plugin layout 双产物，以及 `./plugins/<name>` 目录同步规则。

## 自动化方案（已开始实施）

不需要改动 sink，也不需要第二套 fetch 出口：现有 esbuild bundle 已自包含 SDK。

1. 默认 `npm run package:plugin`：一次 runtime build，同时生成 Release ZIP 与 plugin layout，并完成目录规则自检。
2. `sync-catalog`：把 plugin layout、marketplace entry 同步到 fork 分支；dry-run 不触网，push 前再次校验。
3. `catalog-sync.yml`：版本 tag 触发跨仓同步；需要 fork 仓库范围的 fine-grained PAT。
4. PR 是否 merge、官方目录最终采用何种人工审阅标准，仍由 zai-org 维护者决定。

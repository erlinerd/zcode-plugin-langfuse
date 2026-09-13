# Spec: 官方目录自动化提交（bundle 直提）

Status: ready-for-agent

Labels: ready-for-agent

## Problem Statement

官方 ZCode 插件目录（zai-org/zcode-plugins）要求插件以"零构建、可人工审阅"的形态入树提交。本仓库上游是 TS + 官方 SDK + esbuild 的形态，与官方要求不同构。当前 PR #11 里那份纯 JS 副本是人工翻写的——每次发新版需要 1~2 小时手工同步，且有源码漂移风险。同时实测发现 mimosa 先例：官方目录已接受"壳 + 构建产物"形态的插件在架（1.0.3，含 6.2MB 密封 payload），说明构建产物形态在官方目录是**被实践接受过的**。用户希望官方目录同步成本趋近于零。

## Solution

提供两个脚本（及一个可选 CI workflow），把"目录同步"从人工翻写降为发版流水线的一个自动环节：

1. **统一构建（`npm run package:plugin`）**：现有发布构建在同一次 bundle 后同时产出 Release ZIP 与 `artifacts/plugin-layout/plugins/zcode-plugin-langfuse/`（manifest + hooks.json + dist bundle + 元数据文件），并在本地用目录规则自检。
2. `sync-catalog`：把组装结果提交到 fork（erlinerd/zcode-plugins）的 PR 分支，自动 push；PR 自动更新。
3. （可选 Level 2）`catalog-sync.yml` CI workflow：打 tag 即全自动触发 1+2。

提交形态决策：**esbuild bundle 直提**（mimosa 先例背书），不做双策略源码重构——SDK 保持静态依赖、esbuild 内联，产物自包含，官方零依赖树可运行（已实测验证）。

## User Stories

1. As a 插件维护者, I want 一条统一构建命令同时产出 Release ZIP 与官方目录布局, so that 我不再手工维护第二份插件副本
2. As a 插件维护者, I want 产出的布局在本地先用上游目录的校验规则自检, so that 提交不会因结构性问题被拒
3. As a 插件维护者, I want marketplace 条目从同一 manifest 源自动生成, so that 名称/版本永远不会在两个通道间漂移
4. As a 插件维护者, I want sync 脚本默认幂等, so that 重复运行不会污染 fork 分支历史
5. As a 插件维护者, I want sync 的 `--dry-run` 模式打印将执行的 git 操作而不执行, so that 我能在推送前确认
6. As a 插件维护者, I want 同步失败（认证/校验/网络）时脚本大声失败并给出可行动的提示, so that 我不会默默漏掉一次同步
7. As a 插件维护者, I want 提交的 bundle 文件头部声明"本文件由 vX.Y.Z 的构建生成", so that 审阅者一眼知道内容来源与版本
8. As a 插件维护者, I want CI 在版本 tag 推送时自动完成官方同步, so that 每次发版我唯一的动作是打 tag
9. As a 插件维护者, I want CI 的凭证只授予 fork 仓库的 Contents 写权限, so that 自动化无法触碰其他任何资源
10. As a PR #11 的审阅者, I want PR 描述如实声明提交形态为构建产物并引用 mimosa 在架先例, so that 审阅决策基于诚实的陈述
11. As a PR #11 的审阅者, I want bundle 中包含生成来源标记（如头部注释）, so that 我能理解该文件不是手写源码
12. As a 未来接手的贡献者, I want 整个同步流程有文档记录, so that 过程不依赖 tribal memory
13. As a 官方目录用户（merge 后）, I want 目录里的版本与上游 tag 一一对应, so that 版本可信可追溯
14. As a 插件维护者, I want sync 脚本在本地 clone 缺失时给出初始化指引, so that 首次使用不需要读源码
15. As a 插件维护者, I want 统一构建完成并验证通过后把真实经验沉淀到长期记忆与 Obsidian, so that 下一次多渠道发布可以复用经过验证的流程，而不是重复探索

## Implementation Decisions

- **形态决策**：提交 esbuild bundle（`dist/hooks/entry.mjs`，SDK 内联自包含），不做「SDK 动态导入 + fetch 兜底」双策略重构。依据：mimosa 1.0.3 以"壳 + 6.2MB 密封 payload"形态在架；本方案产物 150KB、非混淆，透明度更高。
- **统一构建入口**（`npm run package:plugin`，组装逻辑在 `scripts/build-layout.mjs`）：运行一次 runtime bundle 后同时产出 Release ZIP 与 `artifacts/plugin-layout/plugins/zcode-plugin-langfuse/`；两者直接复用同一次构建生成的文件集，不重复 bundle 或解包 ZIP；布局内容 = ZIP 同源文件 + `package.json`（仅元数据）+ `README.md`/`README_CN.md`/`LICENSE`；版本号从 manifest 单源读取注入。
- **本地校验**：组装器内置目录规则的本地复刻断言（source 路径形态、manifest 名称/版本/description_i18n 对齐、文件数/字节上限、kebab-case），并验证 bundle、Hook 事件和 marketplace entry 的一致性；上游 validate.py 已在预览模拟中实测通过。
- **`sync-catalog` 脚本**（`scripts/sync-catalog.mjs`）：约定本地 fork clone 路径（参数可覆盖，缺失时打印 clone 指令）；`--dry-run` 打印计划操作；push 前强制本地校验通过；commit message 模板含版本号。
- **`catalog-sync.yml` workflow**：`on: push: tags: v*.*.*`；步骤 = checkout 上游 → `npm run package:plugin` → 配置 PAT 推送 fork 分支。Secret 名 `CATALOG_SYNC_PAT`（fine-grained，仅 `erlinerd/zcode-plugins` 的 Contents: Read and write）。workflow 失败不阻塞 release.yml。
- **PR #11 描述修正**（一次性人工，随 rollout 执行）：撤回 "no generated bundles" 承诺，改为"构建产物直提（mimosa 1.0.3 在架先例）"。
- **零源码改动**：`src/` 不动；`langfuse` 静态依赖保持；现有 Release 构建语义保持，统一入口在其上扩展官方目录产物。
- **经验沉淀**：默认双产物构建完成并验证通过后，立即追加一条不含凭证、真实 payload、提示词或 transcript 的长期记忆，并通过已安装的 Obsidian CLI 写入一篇可检索的工程经验卡；只记录已验证事实、失败原因、取舍和可复用命令，不把计划写成结果。同步/CI 完成后的新经验可追加到同一条记录。

## Testing Decisions

- 好测试的标准：只断言脚本的外部行为（输出树的内容与结构、dry-run 的计划输出、失败时的退出码与信息），不断言 esbuild 内部实现。
- **Seam 1（主接缝）**：统一构建的 plugin layout 输出目录（`artifacts/plugin-layout/plugins/zcode-plugin-langfuse/`）。测试 = 给定当前仓库构建产物，运行 `npm run package:plugin` 后断言：目录树结构（8 文件形态）、plugin.json 与 marketplace 条目字段对齐、entry.mjs 含生成来源头、本地复刻规则全绿。Prior art：预览阶段 /tmp/zai-sim 模拟（已实测通过）。
- **Seam 2**：`sync-catalog --dry-run` 的计划输出（git add/commit/push 命令序列文本）。真实推送不进自动化测试（涉及网络与凭证），以一次人工 smoke 覆盖。
- Prior art：`scripts/validate.mjs` 的清单自校验风格；`test/` 下 vitest 单测组织方式。
- 经验沉淀的验证：只检查写入成功与内容边界（包含验证过的结果和下一次操作入口；不包含 secret、真实 Hook payload、prompt 或 transcript）；不测试 Obsidian 本身的索引实现。

## Out of Scope

- 「SDK 动态导入 + fetch 兜底」双策略重构（bundle 形态下无必要）
- pi / Codex 通道的任何适配
- 保证 PR #11 被 merge（维护者决策，不可控）
- 官方目录的版本回滚/下架流程
- 在统一构建尚未完成前，把未验证的方案写成“已完成经验”

## Further Notes

- mimosa 先例要点：1.0.3 在架，`payload/` 含 6.2MB 密封+混淆产物（含 embedded-key、protected-loader）；本方案产物 150KB 透明 bundle，激进程度远低于先例。
- CI 跨仓推送的 PAT 是唯一需要人工在 GitHub UI 操作的环节（生成 + 配置 secret），文档需给出精确权限清单。
- fork clone 的默认路径约定需在脚本 `--help` 与文档中一致说明；`pi update`/`pi install` 语义不涉及。

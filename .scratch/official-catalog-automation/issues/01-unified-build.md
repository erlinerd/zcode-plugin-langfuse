# 01: 统一构建双产物

**What to build:** 让维护者运行一次统一构建，即可同时得到 Release ZIP 与插件市场所需的 plugin 布局；两份产物来自同一条构建链，不再人工维护第二份插件副本。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] 一次统一构建同时产出 Release ZIP 与插件市场布局，且不重复执行插件 bundle 构建
- [x] 两份产物使用同一版本号、manifest 与生成内容，不允许版本或入口漂移
- [x] 插件市场布局包含可独立运行的自包含 bundle、hook 声明、双语说明、许可证与第三方声明
- [x] Release artifact 校验与插件市场规则校验均通过；校验失败时构建以非零状态结束
- [x] 重复运行会清理或覆盖旧产物，不残留上一版本文件；不改变插件运行时与隐私边界
- [x] 在最高构建接缝增加测试，只断言产物结构、字段对齐、校验结果和失败行为

# Changelog

## v1.8.18

- **关键修复：点击入口按钮无反应 + 整页卡死**
  根因：`COMMON_STOPWORDS` const 在 705 行声明，但 `extractSharedSnippets` 在 682 行就引用它 → TDZ `ReferenceError` → `renderManager` 抛错后 `root.innerHTML` 没赋值但 `body.pmp18-open { overflow: hidden }` 已加 → 看起来"卡死"
  修复：把 `COMMON_STOPWORDS` 移到文件顶部（§1 后），先于 `extractSharedSnippets`
  修复：给 `renderManager` 包 try-catch，抛错时显示错误屏而非半渲染，按钮可点 Esc/关闭退出

## v1.8.17

- **性能：人设数据加缓存**：新增 `_personaCache`，避免每次 render 重新解析所有 persona 的 description / title / normalize
- **性能：分组/相似度加 memo**：`_groupMemo` 缓存 same-name / duplicate / similar 三种分组结果，相同 personas 列表直接返回
- **性能：render 节流**：`scheduleRender()` 用 rAF 合并同一帧的多次 render，原生 persona 切换时 PERSONA_UPDATED 事件爆发不再卡顿
- **PERSONA_UPDATED / PERSONA_DELETED 事件监听**：酒馆原生切换 persona / 删除 persona 时，自动 invalidate 缓存并重渲染（如果管理器开着）
- **入口按钮修复**：把 `.pmp18-entry` 的 `position: relative` 改成 `isolation: isolate`，避免在某些 flex/overflow 父级里被裁切消失
- **基准按钮宽度限制**：`.pmp18-base-btn-meta` 加 `max-width: 140px` + 强名 ellipsis，5+ 个同名同头像的基准按钮不再无限拉宽挤掉 baseline bar
- **代码结构整理**：顶部加 §1-§14 模块注释，原 1697 行单文件按功能分段（数据/事件/分组/diff/UI/编辑器/更新/入口/键盘/init），便于后续维护

## v1.8.16

- 基准按钮加 avatar + 名字 + 副标题：5 个同名同头像无备注的人设也能区分
- 共同片段提取规则收紧：长度下限 2→3；度量单位必须跟数字一起（不再单独高亮 `kg` / `cm`）
- 新增 COMMON_STOPWORDS 黑名单：身高 / 三围 / 体重 / 性格 / 特点 / 性别 / 血型 / 发色 等通用描述词不参与"共同片段"
- 更新检查加 cache-buster（`?t=...` 随机数），绕过 raw.githubusercontent.com 5-10 分钟 CDN 缓存，立即看到新版本

## v1.8.15

- 选 persona checkbox / 清除选择 / 全选组 改为 in-place DOM 更新，不再触发 `renderManager()` 重渲染，彻底避免列表页回顶
- 新增 `updateSelectionHint()` 函数，只替换底部 selection bar 一段 DOM
- 1.8.14 的 scrollTop 恢复机制作为兜底保留

## v1.8.14

- 保留 `pmp18-content` / `pmp18-compare-workspace` / `pmp18-tabs` 的 scrollTop + scrollLeft，重渲染后用 rAF 恢复
- 保留搜索框光标和焦点，跨重渲染继续输入不会丢字
- 注：v1.8.15 进一步把复选框改成 in-place 更新，不再依赖 scroll 恢复

## v1.8.13

- 移动端对比页：基准/对象按钮变小、share-panel 设 max-height 并可滚动、对比工作区改为整页滚动而不是被 flex 切碎
- 移动端编辑框：全屏+flex 布局，textarea 用 `flex:1 1 auto; min-height:0`，避免被键盘顶到屏幕外
- 移动端对比卡：other-card 改为两列网格，avatar 缩到 26px，文字两行省略

## v1.8.13

- 移动端对比页：基准/对象按钮变小、share-panel 设 max-height 并可滚动、对比工作区改为整页滚动而不是被 flex 切碎
- 移动端编辑框：全屏+flex 布局，textarea 用 `flex:1 1 auto; min-height:0`，避免被键盘顶到屏幕外
- 移动端对比卡：other-card 改为两列网格，avatar 缩到 26px，文字两行省略

## v1.8.12

- 手机端 CSS 适配：使用 `100dvh` 处理移动浏览器地址栏导致的窗口塌陷；窗口默认铺满、去掉圆角
- 入口按钮 `pointer-events:auto` + 提高 z-index，修复全屏浏览器点不动的问题
- 移动端单列/双列自适应卡片网格、tab 横向滚动
- 对比页在窄屏下改为上下堆叠（左右双列易被压扁）
- 编辑器弹窗移动端全屏化
- 更新：扩展装在第三方目录时自动尝试多种路径；都失败时给出 GitHub 手动下载指引

## v1.8.12

- 手机端 CSS 适配：使用 `100dvh` 处理移动浏览器地址栏导致的窗口塌陷；窗口默认铺满、去掉圆角
- 入口按钮 `pointer-events:auto` + 提高 z-index，修复全屏浏览器点不动的问题
- 移动端单列/双列自适应卡片网格、tab 横向滚动
- 对比页在窄屏下改为上下堆叠（左右双列易被压扁）
- 编辑器弹窗移动端全屁全屏化
- 更新：扩展装在第三方目录时自动尝试多种路径；都失败时给出 GitHub 手动下载指引

## v1.8.10

- 备注/标题作为同名区分小字（无则短 ID）
- 跨结构/低相似：共同片段列表 + 正文高亮
- 列表删除人设（确认后写回）
- 对比页图例说明各色块含义

## v1.8.9

- 修复设置内更新 CSRF（X-CSRF-Token）

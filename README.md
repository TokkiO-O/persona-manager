# Persona Manager v1.8.3

SillyTavern 第三方扩展：Persona 管理、同名/完全重复/高相似检测、多 Persona 横滑对比（基准固定）、无序文本匹配、对比内编辑写回、自适应高亮、更新后自动刷新。

## 新增功能 (v1.8.3)

- **版本更新检测**：在设置面板中显示当前版本，自动检查 GitHub 最新版本，有新版本时显示“NEW”角标，点击可查看更新日志并跳转下载。
- **允许同名 Persona 参与相似度检测**：新增开关，开启后即使名称相同，也会基于描述内容进行相似度比对，解决修改后未出现在高度相似列表的问题。
- **列表页直接编辑 Persona**：在 Persona 卡片上增加编辑按钮，可直接修改名称和描述，无需进入对比模式。
- **差异检测敏感度调节**：新增滑块，可调整段落匹配的敏感度（10%~60%），更精细控制“修订高亮”和“并排高亮”的差异显示。

## 功能摘要

- 多选 ≥2 全部参与对比，可随时切换基准
- 无序内容匹配 + 文字级高亮
- 对比内编辑 → 写回原 Persona → 立即刷新对比
- 相似阈值可调、编辑二次确认
- 官方 `hooks.update` 更新后自动刷新
- 同名检测、完全重复检测、高度相似检测（支持同名开关）
- 差异检测敏感度调节

## 安装

扩展管理器粘贴仓库地址，或手动放到：

`SillyTavern/public/scripts/extensions/third-party/persona-manager/`

目录内需直接包含 `index.js`、`style.css`、`manifest.json`、`README.md`。

## 使用

1. 打开「用户设定 / Persona 管理」面板，应能看到 Persona Manager 按钮；否则用右下角浮动按钮或控制台 `openPersonaManager()`。
2. 勾选多个 Persona → 开始对比。
3. 左侧为基准（可切换），右侧左右滑动查看其他对比列；每列上下滚动阅读全文。
4. 在设置中可调整相似阈值、差异敏感度、同名参与相似检测等。

## 版本

v1.8.3

## v1.8.5 更新

### 修复
- 修复编辑 Persona 描述后覆盖原生 `persona_descriptions` 对象、导致 SillyTavern 原 Persona 界面描述为空的问题。
- 编辑时只更新 `description`，保留 Persona 原有的 position、depth、role、lorebook、title 等字段。

### 性能优化
- 移除 Persona Manager 常驻的全页面轮询/扫描思路。
- Persona Manager 未打开时不进行 Persona 数据对比刷新。
- 管理器打开后才响应 Persona 生命周期事件并合并刷新。
- 使用 `requestAnimationFrame` 合并连续刷新，减少切换 Persona 时的卡顿。

### 更新中心
- 支持在 Persona Manager 设置区域提示新版本。
- 有更新时显示 `NEW` 小角标。
- 点击更新后才弹出版本更新确认窗口。
- API 检查失败不再显示“无法获取详细日志 / 前往 Release / 前往下载”提示。
- 更新成功后自动刷新页面。
- 从 SillyTavern“管理扩展”更新后通过 `update` hook 自动刷新。

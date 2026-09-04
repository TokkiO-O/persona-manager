# Persona Manager v1.8.0

SillyTavern 第三方扩展：Persona 管理、同名/完全重复/高相似检测、多 Persona 对比（可切换基准）、无序文本匹配、对比内编辑并写回原数据、自适应高亮、更新后自动刷新。

## v1.8.0 亮点

- **多 Persona 对比**：选 2 个及以上全部参与；可随时切换基准。
- **无序内容匹配**：先精确匹配，再按相似度做最佳配对，不依赖原始行顺序。
- **对比布局可切换**：左右并排 / 修订视图。
- **自适应高亮**：高相似强标差异，低相似强标相同部分。
- **只看差异** 开关。
- **对比内编辑**：修改后写回原 Persona 描述，并立即刷新对比。
- **相似阈值可调**（设置页）。
- **编辑二次确认**，避免误写。
- **官方 hooks.update**：管理扩展更新成功后自动刷新页面。
- 入口同时兼容「全局设置」与 `Global Settings`；列表选择框不再挡住头像。

## 安装

### 扩展管理器（推荐）

在 SillyTavern → 扩展 → 安装扩展，粘贴：

```
https://github.com/xingx121/persona-manager
```

更新后页面会自动刷新（依赖 `hooks.update`）。若未自动刷新，可手动 `Ctrl + F5`。

### 手动安装

将解压后的文件夹放到：

```
SillyTavern/public/scripts/extensions/third-party/persona-manager/
```

目录内应直接包含：

- `index.js`
- `style.css`
- `manifest.json`
- `README.md`

不要形成双层 `persona-manager/persona-manager/`。

## 使用

1. 打开含「全局设置 / Global Settings」的面板，点击 **Persona Manager** 入口。
2. 在列表中勾选 2 个及以上 Persona，点「开始对比」。
3. 对比页顶部可切换基准、布局（并排/修订）、是否只看差异。
4. 点「编辑」可修改描述；确认后会写回原 Persona 并刷新对比。
5. 「设置」标签可调整相似检测阈值。

## 数据说明

- 只读使用 `power_user.personas` 与 `power_user.persona_descriptions`。
- 编辑保存时写入 `persona_descriptions`，并尝试调用酒馆的 `saveSettingsDebounced` / `saveSettings`。
- 不修改其他扩展界面，不轮询远程仓库。

## 版本

v1.8.0

# Persona Manager v1.9.0

SillyTavern 第三方扩展。自 1.9.0 起改为 **ES 多模块** 结构（仍由单个 `index.js` 入口加载）。

## 目录结构

```
persona-manager/
  index.js              # 入口：init、onUpdate、接线
  style.css
  manifest.json
  README.md
  CHANGELOG.md
  src/
    constants.js
    state.js
    util.js
    persona-data.js
    similarity.js
    diff.js
    update.js
    entry.js
    persona-listener.js
    ui/
      components.js
      compare.js
      editor.js
      render.js
```

## 安装

解压后目录必须是：

`.../extensions/third-party/persona-manager/`

其中直接包含 `index.js`、`style.css`、`manifest.json` 与 **整个 `src/` 文件夹**。  
不要多一层 `persona-manager-main/`。

## 使用

- 用户设定 / Persona 面板入口，或浮动按钮，或控制台 `openPersonaManager()`
- 设置页可检查更新（需仓库 `manifest.json` + `CHANGELOG.md`）

## 版本

v1.9.0（结构拆分，行为对齐 1.8.19）


仓库：https://github.com/TokkiO-O/persona-manager

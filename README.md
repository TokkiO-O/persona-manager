# Persona Manager v1.8.7

SillyTavern 第三方扩展：Persona 管理、同名/重复/相似检测、基准+单对方细比、列表编辑写回、远程 CHANGELOG 更新检查。

## v1.8.7

- **修复列表编辑串改其他人设**：写回只针对目标 id；不把编辑内容刷到当前激活人设（除非就是在编辑它）。
- **对比**：默认「基准 + 当前一个对方」，顶部切换其他对方；双方都有差异底色。
- **更新**：远程 `manifest.json` 判版本 + 远程 `CHANGELOG.md` 作日志；已是最新也有明确提示；更新成功强制刷新。
- 去掉 index 内置大段更新日志字符串。

## 安装

目录必须为：

```
.../third-party/persona-manager/
  index.js
  style.css
  manifest.json
  README.md
```

不要双层文件夹。安装后 Ctrl+F5。

仓库需提供：

- `https://raw.githubusercontent.com/xingx121/persona-manager/main/manifest.json`
- `https://raw.githubusercontent.com/xingx121/persona-manager/main/CHANGELOG.md`

## 使用

- 用户设定 / Persona 面板入口；或浮动按钮 / `openPersonaManager()`
- 列表「编辑」改名称与描述
- 多选对比后可切换当前对方

## 版本

v1.8.7

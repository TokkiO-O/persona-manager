# Persona Manager v1.6.0

SillyTavern Persona 管理扩展：管理、搜索、同名/重复检测、全文匹配对比、多 Persona 对比与原 Persona 编辑同步。

## v1.6.0

本版本以已经实际验证可用的 v1.4.0 入口机制为基础，优先恢复 Persona Manager 入口的可靠出现。

- 保留 1.4.0 的「全局设置」定位方式。
- 保留 MutationObserver，Persona 页面后生成时也能自动插入。
- 不再依赖猜测性的 `.persona_management_global_settings` 作为唯一入口。
- 版本统一为 1.6.0。
- manifest 不主动展示 GitHub 仓库地址。
- 保留原有管理、搜索、比较等功能。

## 安装方法一：SillyTavern 扩展管理器

在第三方扩展安装界面使用仓库地址：

`https://github.com/xingx121/persona-manager`

安装/更新后，第一次建议重新加载一次 SillyTavern。

## 安装方法二：手动安装

把解压后的 `persona-manager` 文件夹放到：

`SillyTavern/public/scripts/extensions/third-party/`

最终结构：

`SillyTavern/public/scripts/extensions/third-party/persona-manager/`

文件夹内应直接包含：

- `index.js`
- `style.css`
- `manifest.json`
- `README.md`

不要形成 `persona-manager/persona-manager/` 的双层目录。

## 更新

扩展管理器负责下载/替换新版文件；扩展自身只负责检测已安装文件的版本变化并刷新页面。

如果更新后没有刷新，可以手动 `Ctrl + F5` 一次。

## 版本

v1.6.0

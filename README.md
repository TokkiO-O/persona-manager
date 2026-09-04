# Persona Manager v1.6.0

SillyTavern Persona 管理扩展：管理、搜索、同名/重复检测、全文匹配对比、多 Persona 对比与原 Persona 编辑同步。

## v1.6.0

本版本以已经实际验证可用的 v1.6.1 入口机制为基础，优先恢复 Persona Manager 入口的可靠出现。

- 保留 1.6.1 的「全局设置」定位方式。
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


### v1.6.1
- 支持选择 2 个以上 Persona：第 1 个作为基准，其余全部参与比较。
- 比较匹配不再依赖原始行顺序：先精确匹配，再进行无序最佳匹配。
- 修改差异直接高亮在文字本身，弱化整行背景色。
- 保留 v1.6.0 已验证可用的“全局设置”入口挂载机制。
- manifest 不再声明 author，用于测试 SillyTavern 是否仍从 Git 信息显示作者/分支/提交。


## v1.7.0
多 Persona 对比、可切换基准、完整描述展示、无序内容匹配、文字级差异高亮、比较界面编辑与重新比较。不会修改其他扩展的管理器显示。

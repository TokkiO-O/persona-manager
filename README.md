# Persona Manager v1.8.2

SillyTavern 第三方扩展：Persona 管理、同名/完全重复/高相似检测、多 Persona 横滑对比（基准固定）、无序文本匹配、对比内编辑写回、自适应高亮、更新后自动刷新。

## v1.8.2

- 入口优先挂到 `#persona-management-block` / `#user-settings-block`（「用户设定管理」），抽屉关闭时也会预先插入；失败时仍有右下角浮动按钮与控制台 `openPersonaManager()`。
- 多对比：**左侧基准固定**，右侧多个对比列**横向滑动**；每列内容可纵向滚动。
- 默认显示全部内容；「只看差异」为可选开关。
- 修复对比区无法滚动的问题。

## 功能摘要

- 多选 ≥2 全部参与对比，可随时切换基准
- 无序内容匹配 + 文字级高亮
- 对比内编辑 → 写回原 Persona → 立即刷新对比
- 相似阈值可调、编辑二次确认
- 官方 `hooks.update` 更新后自动刷新

## 安装

扩展管理器粘贴仓库地址，或手动放到：

`SillyTavern/public/scripts/extensions/third-party/persona-manager/`

目录内需直接包含 `index.js`、`style.css`、`manifest.json`、`README.md`。

## 使用

1. 打开「用户设定 / Persona 管理」面板，应能看到 Persona Manager 按钮；否则用右下角浮动按钮或控制台 `openPersonaManager()`。
2. 勾选多个 Persona → 开始对比。
3. 左侧为基准（可切换），右侧左右滑动查看其他对比列；每列上下滚动阅读全文。

## 版本

v1.8.2

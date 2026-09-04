# Persona Manager v1.6.1

SillyTavern 第三方扩展：Persona 管理、搜索、同名/完全重复检测、高相似提示、自适应对比工作区。

## 本版本改动（相对 1.6.0）

- 接入 SillyTavern 官方扩展生命周期钩子 `hooks.update`，在「管理扩展」更新成功后自动刷新页面，新代码立即生效。
- 入口按钮同时兼容中文「全局设置」与英文 `Global Settings`。
- 版本号统一为 1.6.1。

## 功能

- 稳定入口按钮（MutationObserver + 全局设置定位）
- 全部 Persona 列表 / 搜索
- 同名分组
- 完全重复检测（名称 + 描述一致）
- 高相似 Persona 提示（本地文本相似度）
- 双 Persona 对比工作区（行级 + 词级差异高亮、同步滚动）

## 安装方法一：扩展管理器（推荐）

在 SillyTavern → 扩展 → 安装扩展，粘贴仓库地址：

```
https://github.com/xingx121/persona-manager
```

安装或更新后，若使用本版本，页面会在更新成功后自动刷新。若未自动刷新，可手动 `Ctrl + F5` 一次。

## 安装方法二：手动安装

把解压后的文件夹放到：

```
SillyTavern/public/scripts/extensions/third-party/persona-manager/
```

最终结构必须是：

```
.../third-party/persona-manager/
  ├── index.js
  ├── style.css
  ├── manifest.json
  └── README.md
```

不要出现 `persona-manager/persona-manager/` 双层目录。

## 更新说明

- 官方「管理扩展」更新成功后，会调用扩展声明的 `onUpdate` 钩子并自动 `location.reload()`。
- 扩展自身不再轮询远程仓库，也不修改其他扩展的界面。

## 使用

1. 打开任意带有「全局设置 / Global Settings」的面板（常见于 Persona / 用户设置相关页面）。
2. 点击 **Persona Manager** 按钮进入管理界面。
3. 可按标签查看全部 / 同名 / 完全重复 / 高度相似，支持搜索与多选后对比。

## 版本

v1.6.1

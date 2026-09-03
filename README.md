# Persona Manager

SillyTavern 第三方扩展，用于整理、识别和对比大量 Persona（User）。

**v1.3.0 是一次重新设计。**

这一版不再给原生 Persona 卡片增加“二次别名”，而是使用 SillyTavern 已有的 **Persona 名称 + Persona 描述/备注** 作为识别信息，并提供一个独立的 Persona Manager 管理界面。

## 功能

### 全部 Persona

集中查看当前 SillyTavern 能读取到的 Persona。

支持：

- 搜索 Persona 名称
- 搜索 Persona 描述 / 备注
- 查看 Persona ID
- 查看头像（当前环境支持时）
- 多选 Persona

### 同名 Persona

自动按照 Persona 的**原始名称**分组。

例如：

```text
张三 × 3
├── Persona 1
├── Persona 2
└── Persona 3
```

打开同名组后，可以直接查看每个 Persona 的描述/备注，从而区分实际身份。

这里不再创建额外别名字段，因为 Persona 本身已经有描述/备注可以承担身份说明。

### 完全重复检测

自动寻找：

```text
名称完全一致
+
Persona 描述完全一致
```

的 Persona。

插件只检测，不会自动删除或修改 Persona。

### 高度相似提示

对**不同名称**的 Persona 描述进行本地文本相似度计算。

当前使用轻量级字符二元组 Jaccard 相似度作为提示依据。

它的定位是：

> “这两个 Persona 看起来可能有大量重复内容，建议手动检查。”

它不是 AI 判断，也不是最终结论。

### Persona 对比

在列表中多选 Persona。

选择至少两个后，会出现对比区域，方便并排查看：

- 名称
- Persona 描述 / 备注
- 头像

高度相似列表也可以直接选择两个 Persona 进入对比。

## v1.3.0 设计原则

### 不修改原生 Persona

本扩展不会：

- 修改 Persona 原始名称
- 增加二次别名
- 修改 Persona 描述
- 修改聊天记录
- 修改 `{{user}}` 宏
- 自动重命名 Persona
- 自动删除 Persona

### 不依赖额外 Persona 数据库

v1.3.0 不需要为 Persona 别名建立额外存储。

它直接读取 SillyTavern 当前的 Persona 数据：

```js
power_user.personas
power_user.persona_descriptions
```

因此不会为了这个扩展向 `settings.json` 写入一套新的 Persona 别名数据。

### 不依赖 Extras

本扩展不需要 Extras 服务或外部 API。

检测和比较在浏览器本地完成。

## 使用

安装完成后，在 SillyTavern 的 Persona 管理区域中会出现：

> **Persona Manager**

点击后进入独立管理界面。

界面提供：

```text
全部 Persona
同名 Persona
完全重复
高度相似
```

以及搜索和多选对比功能。

### 快捷键

打开管理器后：

- `Esc`：关闭
- `Ctrl + F` / `⌘ + F`：快速定位搜索框

## 安装

### SillyTavern 扩展安装器

打开：

```text
扩展 → 安装扩展
```

输入本仓库：

```text
https://github.com/xingx121/persona-manager
```

安装完成后刷新 SillyTavern。

### 手动安装

将整个仓库放入 SillyTavern 的第三方扩展目录。

常见目录：

```text
SillyTavern/public/scripts/extensions/third-party/
```

最终结构：

```text
persona-manager/
├── manifest.json
├── index.js
├── style.css
└── README.md
```

## 兼容性

建议使用较新的 SillyTavern 版本。

本扩展使用 SillyTavern 的 Persona 数据：

```js
power_user.personas
power_user.persona_descriptions
```

如果 SillyTavern 后续改变 Persona 数据结构，可能需要适配。

## 数据与隐私

Persona 的名称、描述和 ID 只用于当前页面的本地显示、分组、搜索和比较。

本扩展：

- 不上传 Persona 内容
- 不调用外部 AI
- 不需要 Extras
- 不建立远程数据库
- 不自动修改或删除 Persona

## 版本

### v1.3.0

重新设计版本：

- 移除二次别名
- 移除 alias 数据存储
- 移除原生 Persona 卡片内的额外输入框
- 新增独立 Persona Manager 管理界面
- 新增全部 Persona
- 新增同名 Persona 分组
- 新增完全重复检测
- 新增高度相似提示
- 新增多选 Persona 对比
- 新增搜索
- 新增移动端适配
- 使用立即初始化，避免依赖 jQuery ready 时序

## 许可证

AGPL-3.0

# Persona Manager

SillyTavern 第三方扩展，用于更好地管理大量 **Persona（User）**。

解决同名、同图、内容细微差异的 Persona 难以区分的问题。

## 功能

- **二次别名（仅 Persona 界面）**  
  在原生 Persona Management 列表中，每个 Persona 旁边可直接填写二次别名。  
  只用于界面区分，**不影响**原名字、聊天记录、`{{user}}` 宏和实际游玩。

- **同名对比**  
  自动按名字分组，支持选择多个同名 Persona 进行并排对比，用颜色高亮差异（新增绿色 / 删除红色）。

- **内容重复检测**  
  检测描述 + 标题完全相同但名字不同的 Persona，方便清理重复项。

- **兼容官方 Nicknames 扩展**  
  优先读取官方 Nicknames 的全局昵称作为显示名。

- **数据安全**  
  所有别名数据存储在 `accountStorage`，**不会写入** `settings.json`，避免影响酒馆启动速度和流畅性。

## 安装

1. 打开 SillyTavern → **扩展** → **安装扩展**
2. 粘贴本仓库地址：

```
https://github.com/xingx121/persona-manager
```

3. 安装完成后刷新页面。打开 **Persona Management** 即可看到二次别名输入框，以及「Persona 对比 / 重复检测」按钮。

## 使用方法

### 二次别名
1. 打开 **Persona Management**
2. 在每个 Persona 卡片下方找到「二次别名」输入框
3. 输入后失焦自动保存

别名只在 Persona 管理界面显示，不会影响其他任何地方。

### 同名对比 & 内容重复检测
1. 点击「Persona 对比 / 重复检测」按钮
2. 在弹窗中切换「同名对比」或「内容重复」标签
3. 在同名组中勾选需要对比的 Persona，点击「对比选中」查看差异高亮

## 注意事项

- 二次别名**不会**修改原始 Persona 名称，也不会影响聊天和提示词。
- 数据存储在浏览器的 `accountStorage` 中，清除浏览器数据会导致别名丢失。
- 与官方 [SillyTavern-Nicknames](https://github.com/SillyTavern/SillyTavern-Nicknames) 扩展兼容，会优先使用其全局昵称。

## 文件结构

```
persona-manager/
├── manifest.json
├── index.js
├── style.css
└── README.md
```

## 兼容性

- SillyTavern 1.12+（建议使用较新版本）
- 不依赖 Extras 或其他扩展

## 许可证

AGPL-3.0（与 SillyTavern 保持一致）

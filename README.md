# Persona Manager v1.5.0

SillyTavern Persona 管理扩展。

## 本版重点

- 启动时立即创建入口，不等待 Persona 数据加载；只在“全局设置”出现后把入口挂到其上方。
- 点击 Manager 后才读取 Persona 数据。
- 正确兼容 `persona_descriptions[id].description`。
- 多选 Persona 后可进行 2 个或多个 Persona 对比。
- 对比采用全文分段扫描与相似度匹配，不依赖原始前后顺序。
- 相同/差异/独有内容分类。
- 点击匹配项可展开原 Persona 内容并编辑。
- 保存后直接写回 SillyTavern Persona 描述，并重新计算对比。
- 选择框固定在卡片右上角，不覆盖头像。
- 对比工作区全屏显示。

## 编辑同步

Manager 不保存独立的 Persona 描述副本，而是直接读取和修改 SillyTavern 的 Persona 数据。保存后会调用设置保存接口；重新打开 Manager 会读取最新内容。

## 注意

不同 SillyTavern 版本的 Persona 内部数据结构可能变化。若原生 Persona 编辑器有额外的保存逻辑，建议保存后重新打开 Manager 验证。

## 安装

将本目录放入：

`data/default-user/extensions/third-party/persona-manager`

然后在 SillyTavern 扩展管理中启用。

## 版本

v1.5.0

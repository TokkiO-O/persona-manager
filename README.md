# Persona Manager v1.8.6

SillyTavern 第三方扩展：Persona 列表管理、同名/重复/相似检测、多列横滑对比、列表内编辑写回、更新检查。

## v1.8.6（重要修复）

- **入口**：删除 1.8.5 中重复的入口函数（曾覆盖正确挂载逻辑导致按钮消失）；优先挂到 `#persona-management-block` / 用户设定。
- **写回**：正确处理 `persona_descriptions` 的 string / object 结构，保留 position 等字段，避免原生界面描述变空白。
- **性能**：去掉全局 click 捕获与无限轮询；观察者挂载成功后断开，减轻换人设卡顿。
- 列表可直接编辑**名称 + 描述**；同名可纳入高度相似（设置可关）。
- 对比：左基准固定、右横滑；字段型描述按 key 分块 + 块内字词高亮。

## 安装

最终目录必须是：

```
SillyTavern/public/scripts/extensions/third-party/persona-manager/
  ├── index.js
  ├── style.css
  ├── manifest.json
  └── README.md
```

**不要**出现 `persona-manager/persona-manager/` 双层目录。

扩展管理器安装后建议 **Ctrl+F5**。若面板无按钮，可用右下角浮动入口或控制台：

```js
openPersonaManager()
```

## 使用

1. 打开「用户设定 / Persona 管理」→ Persona Manager。
2. 列表勾选 ≥2 个 → 开始对比；可切换基准、只看差异。
3. 卡片上「编辑」可改名称与描述并写回。
4. 设置页可调相似阈值、同名是否参与相似、检查更新。

## 版本

v1.8.6

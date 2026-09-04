# Persona Manager v1.5.3

SillyTavern Persona 管理扩展：管理、查重、全文匹配对比、多 Persona 对比，以及直接编辑原 Persona 描述。

## v1.5.3 修复

- 使用 SillyTavern Persona 面板的真实结构选择器：
  - `.persona_management_global_settings`
- 不再依赖页面上「全局设置」四个字，也不判断该区域是否可见。
- Persona Manager 入口会直接插入到原生 Persona「全局设置」区域上方。
- Persona 面板被 SillyTavern 重新构建时，入口会重新挂载。
- 每 500ms 有一次兜底检查，因此不会出现旧版等待几分钟后仍找不到入口的问题。
- `index.js` 与 `manifest.json` 版本统一为 `1.5.3`。
- 更新检测在安装后约 2 秒开始检查，此后每 10 秒检查一次；检测到 `manifest.json` 版本变化后自动刷新页面。
- manifest 不包含 `homePage`、`repository` 等仓库展示字段。

## 安装

### 方法一：在 SillyTavern 中通过链接安装

1. 打开 SillyTavern。
2. 进入扩展管理。
3. 选择安装第三方扩展。
4. 输入仓库地址：

`https://github.com/xingx121/persona-manager`

5. 安装完成后，第一次请重新加载一次 SillyTavern 页面。

以后通过扩展管理器更新版本时，Persona Manager 会检测版本变化并自动刷新页面。

### 方法二：手动下载

下载并解压扩展后，将 `persona-manager` 文件夹放到：

`SillyTavern/public/scripts/extensions/third-party/`

最终必须是：

`SillyTavern/public/scripts/extensions/third-party/persona-manager/`

其中直接包含：

- `index.js`
- `style.css`
- `manifest.json`
- `README.md`

注意不要多嵌套一层，例如：

`persona-manager/persona-manager/index.js`

这种目录结构会导致扩展无法正确加载。

手动更新时，用新版的文件直接覆盖原 `persona-manager` 文件夹内容，然后重新加载 SillyTavern。

## 更新

### 扩展管理器更新

扩展文件更新后，当前已加载的旧 JavaScript 不会自动变成新代码。v1.5.3 会轮询本地 `manifest.json`：

`旧 VERSION` → `发现 manifest.version 变化` → `location.reload()` → 加载新代码

### 如果仍是旧版本

手动执行一次：

`Ctrl + F5`

之后打开 Persona 页面，入口应该出现在原生「全局设置」区域上方。

## 版本

v1.5.3

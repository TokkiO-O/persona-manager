# Persona Manager v1.5.1

SillyTavern Persona 管理扩展。

## 功能

- Persona Manager 入口固定在 Persona 页面「全局设置」上方。
- 启动时立即创建入口，不等待 Persona 数据读取。
- 如果 Persona 设置区域稍后才渲染，会持续监听并自动挂载，不再只等待几十秒。
- 多选 2 个或多个 Persona 进行对比。
- 全文分段扫描匹配，不依赖原始前后顺序。
- 相同 / 差异 / 独有内容分类。
- 点击对比项可查看对应原 Persona 内容。
- 可直接编辑 Persona 描述并保存回 SillyTavern。
- 保存后重新读取并计算对比结果。
- 选择框固定在 Persona 卡片右上角，不遮挡头像。
- 扩展更新后会自动检测本地 manifest 版本变化并刷新页面，让新代码立即生效。

## 安装

### 方法一：通过 SillyTavern 链接安装（推荐）

1. 打开 SillyTavern。
2. 打开「扩展」。
3. 点击「安装扩展 / Install Extension」。
4. 粘贴本仓库地址：

`https://github.com/xingx121/persona-manager`

5. 确认安装。
6. 安装完成后刷新 SillyTavern 页面。

SillyTavern 的扩展管理器支持从 Git URL 安装第三方扩展；更新扩展后通常需要重新加载页面才能让最新代码生效。

### 方法二：手动安装

1. 下载本仓库文件。
2. 解压 `persona-manager` 文件夹。
3. 将整个文件夹放入：

`SillyTavern/public/scripts/extensions/third-party/`

最终结构应为：

`SillyTavern/public/scripts/extensions/third-party/persona-manager/manifest.json`

并确保同目录下有：

- `index.js`
- `style.css`
- `manifest.json`
- `README.md`

4. 刷新 SillyTavern 页面。

## 更新

### 使用扩展管理器安装

在 SillyTavern 的扩展管理器中更新 Persona Manager。

v1.5.1 会检查本地 `manifest.json` 的版本变化；检测到扩展被更新后，会自动刷新当前页面，使新版本代码立即加载。

如果浏览器仍显示旧界面，可以手动执行一次 `Ctrl + F5`。

### 手动安装

用新版文件夹直接覆盖：

`SillyTavern/public/scripts/extensions/third-party/persona-manager/`

然后刷新页面。

## 数据与同步

Persona Manager 不建立自己的 Persona 描述副本，直接读取 SillyTavern 当前的 Persona 数据。

编辑并保存后，会写回：

`power_user.persona_descriptions`

如果当前 SillyTavern 版本使用对象结构，则只更新其中的 `description` 字段，不覆盖其它 Persona 数据。

## 版本

v1.5.1

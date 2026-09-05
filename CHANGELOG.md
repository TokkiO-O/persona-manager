# Changelog

## v1.9.9

- **多选删除**：底部选择栏增加「删除所选」，一次确认后批量删除
- **删除后保持管理器打开**：不再关界面，直接刷新列表
- 单条删除同样保持界面打开

## v1.9.8

- **修复误报更新**：版本比较改为语义化（仅当远程 > 本地才提示有更新）
- 删除：`/api/avatars/delete` + `powerUserSettings` 双写；失败明确报错
- 删除后尝试刷新原生人设列表

## v1.9.7

- 删除人设：调用 `/api/avatars/delete` 删除头像文件
- 删除二次确认：优先用酒馆 Popup，兼容 TauriTavern

## v1.9.6

- 远程仓库改为 `TokkiO-O/persona-manager`（manifest / CHANGELOG / 更新镜像）

## v1.9.5

- 更新检查增加 gitmirror / ghproxy 等镜像
- 全部镜像失败时说明「扩展仍可用，请手动下载」

## v1.9.4

- 更新检查：GitHub raw 失败时自动回退 jsDelivr
- 设置页「无法连接」时显示具体错误信息

## v1.9.3

- 修复读不到 Persona：`power-user-bridge.js` 正式 re-export
- diff.js / compare.js 补全缺失 import

## v1.9.2

- 修复 `components.js` 损坏 import 导致入口消失

## v1.9.1

- 修正 src 内路径；entry 与 render 解耦

## v1.9.0

- 代码拆分为 `src/` 多模块（ESM）

## v1.8.19

- 修复 `groupBy is not defined`

## v1.8.18

- 修复入口无反应与整页卡死（COMMON_STOPWORDS TDZ）

## v1.8.17

- 人设数据缓存、分组 memo、render 节流、事件监听

## v1.8.16

- 基准按钮头像区分；共同片段规则收紧；更新 cache-buster

## v1.8.15

- 选择改为 in-place DOM 更新，避免列表回顶

## v1.8.14

- 重渲染保留 scrollTop / 搜索焦点

## v1.8.13

- 移动端对比与编辑布局优化

## v1.8.12

- 移动端入口可点、100dvh、更新路径候选

## v1.8.10

- 备注小字、共同片段、删除、对比图例

## v1.8.9

- 修复设置内更新 CSRF

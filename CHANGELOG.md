# Changelog

## v1.9.13

- **更新日志**：与 manifest 一样多源拉取，优先含最高版本号的 CHANGELOG；打开弹窗强制重新检查
- 弹窗显示实际来源 URL；按远程版本截取对应 `##` 节


## v1.9.12

- **删除后残留 [Unnamed Persona]**：删除后不再调用 `getUserAvatars`（避免 ST 按磁盘文件重新 addMissingPersonas）
- 同步逻辑不再向 `power_user` 写入「未命名」占位；并清理已无头像文件的 Unnamed 占位项


## v1.9.11

- **修复完全重复检测为空**：同名/完全重复/高度相似 的缓存互相覆盖，先算同名后完全重复被当成空结果
- 高度相似：完全相同的描述也会显示（满分）；空描述同名可检出


## v1.9.10

- **新人设检测**：缓存改为按 id/名称/描述签名自动失效，打开管理器与切换 Tab 强制刷新
- 监听 `PERSONA_CREATED` / `PERSONA_CHANGED`；标题栏增加刷新按钮
- 更新检查增加 GitHub API 源，减少 CDN 旧缓存；本地已新于远程时明确显示双方版本

## v1.9.9

- 多选删除；删除后保持管理器打开

## v1.9.8

- 语义化版本比较；删除调用 `/api/avatars/delete`

## v1.9.7

- 删除确认与头像 API 删除

## v1.9.6

- 远程仓库改为 TokkiO-O/persona-manager

## v1.9.5

- 更新检查多镜像

## v1.9.4

- jsDelivr 回退

## v1.9.3

- power-user-bridge 修复读列表

## v1.9.0

- 模块化拆分

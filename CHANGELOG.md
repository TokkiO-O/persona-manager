# Changelog

## v1.8.11

- 修复部分内嵌 WebView / 新版 SillyTavern 环境下 Persona 数据读取兼容性问题
- 更新器兼容用户目录与 `third-party` 全局安装目录
- manifest 开启 `auto_update`
- 保持现有 ID-safe 编辑、删除逻辑，不改动原有数据结构

## v1.8.10

- 备注/标题作为同名区分小字（无则短 ID）
- 跨结构/低相似：共同片段列表 + 正文高亮
- 列表删除人设（确认后写回）
- 对比页图例说明各色块含义

## v1.8.9

- 修复设置内更新 CSRF（X-CSRF-Token）

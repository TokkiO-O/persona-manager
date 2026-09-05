# Changelog

## v1.9.0

- 代码拆分为 `src/` 多模块（ESM），入口仍为 `index.js`
- 修复历史问题：`groupBy` 定义在 `util.js` 并正确引用
- 行为对齐 v1.8.19

## v1.8.19

- 修复 `ReferenceError: groupBy is not defined` 导致渲染失败

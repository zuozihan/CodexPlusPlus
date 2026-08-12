# 自动同步上游并打包

工作流：`.github/workflows/sync-upstream-package.yml`

## 做什么

1. 从 `BigPizzaV3/CodexPlusPlus` 拉取 `main`
2. 合并进本 fork 的 `main` 并 push
3. 有更新（或手动强制）时构建：
   - Windows：`setup.exe` + zip
   - macOS：x64 / arm64 DMG + zip
4. 上传 Actions Artifacts
5. 更新固定预发布 `nightly`（可关）

## 触发

- 每天 `08:20 UTC` 定时
- Actions 页手动 `Run workflow`

## 下载

- Actions run 的 Artifacts
- 或 Release：`https://github.com/<你的fork>/releases/tag/nightly`

## 注意

- fork 需开启 Actions
- 默认用 `GITHUB_TOKEN` 推 `main`；若 branch protection 拦 bot，需放行或改用 PAT secret
- 定时任务仅在 **上游有新提交** 时打包；手动运行默认强制打包

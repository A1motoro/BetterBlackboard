# Better Blackboard

面向 CUHK(SZ) Blackboard Learn 的 Chrome 扩展。它在原内容列表中嵌入文件夹下载按钮，同时提供会挤压页面宽度的管理侧栏，支持内容树选择、批量下载以及任务恢复。

## 本地开发

要求 Node.js 22 和 Corepack。

```bash
corepack pnpm install
corepack pnpm dev
```

开发构建位于 `.output/chrome-mv3-dev`。修改代码后 WXT 会重新构建；必要时需要在扩展管理页重新加载扩展并刷新 Blackboard 页面。

生产构建：

```bash
corepack pnpm check
```

构建产物位于 `.output/chrome-mv3`。

## 在 Chrome 中安装

1. 运行 `corepack pnpm build`。
2. 打开 `chrome://extensions`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择项目下的 `.output/chrome-mv3` 目录。
6. 建议把 Better Blackboard 固定到浏览器工具栏。

开发时也可以选择 `.output/chrome-mv3-dev`。每次重新构建后，在 `chrome://extensions` 的扩展卡片上点击“重新加载”，然后刷新课程页面。

## 功能测试

1. 登录 `https://bb.cuhk.edu.cn`。
2. 打开带有 `course_id` 和 `content_id` 参数的课程内容页。
3. 首次使用时点击扩展图标并选择“授权并启用”；后续课程页会自动打开侧栏。
4. 确认原 Blackboard 根内容区出现“下载当前目录全部”，每个文件夹标题后出现“下载文件夹”。
5. 确认右侧栏挤压 Blackboard 页面宽度，而不是覆盖原页面。
6. 分别测试单文件、文件夹全选和取消部分文件，确认三态 checkbox 正确。
7. 点击嵌入按钮或侧栏“下载所选文件”，确认文件保存到 Chrome 下载目录下的 `BB/{课程名}/...`。
8. 下载过程中刷新课程页面，确认侧栏自动恢复且任务状态仍然存在。
9. 测试侧栏收起、取消下载和失败后的单项重试。

扩展只访问用户已授权的 Blackboard origin，课程信息和下载任务默认只保存在本机。

## 调试

- 页面 UI 与 REST 请求：打开 Blackboard 页面的 DevTools，查看 Console 和 Network。
- background 与下载队列：在 `chrome://extensions` 的扩展卡片中点击“Service Worker”。
- 权限问题：在扩展详情页检查“网站访问权限”，然后重新授权并刷新页面。
- 样式或脚本没有更新：重新运行构建、点击扩展“重新加载”，再强制刷新 Blackboard 页面。
- 若学校接口跳转到登录页，先在同一标签页重新登录 Blackboard。

真实环境首轮重点确认：

- content script 与 background 是否都能携带 Blackboard Cookie。
- 302 或跨域 CDN 下载是否能由 `chrome.downloads` 完成。
- 中文文件名、重复文件名和深层目录是否正确。
- 校园网或 VPN 断开时是否显示网络错误。

## Git 工作流

- `main` 始终保持可构建；功能开发使用 `feature/<name>` 分支。
- 提交前运行 `corepack pnpm check` 和 `corepack pnpm format:check`。
- 提交信息使用简短祈使句，例如 `feat: add course content tree`。
- `.output`、`.wxt`、依赖和测试报告均已忽略，不提交生成产物。
- 推送或创建 PR 后，GitHub Actions 会执行格式、lint、类型、测试和构建检查。

## 当前范围

第一版仅支持 CUHK(SZ) Blackboard Original 课程当前内容区。课程聚合、DDL、增量同步、正文裸链接和视频下载尚未包含。

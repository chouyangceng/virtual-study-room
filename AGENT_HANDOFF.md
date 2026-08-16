# 虚拟自习室 Agent Handoff

当前版本：1.3.0（Windows 为权威数据中心；Mac Electron 可通过地址与 token 上传，正式无警告安装仍需 Apple 签名与公证）。

当前 Windows 发布形式为轻量版：`E:\虚拟自习室\轻量版\虚拟自习室.exe`。它复用系统 Edge 和 Node，不再使用 Electron 大包。桌面快捷方式已指向该启动器。

## 当前架构

- `TaskManager` 是今日任务、每日坚持和番茄钟任务的唯一数据源。
- `PomodoroTimer` 保存 `taskId` 与可选 `sessionNote`，专注完成后回写任务的番茄数和分钟数，并把完整 session 交给 `ReviewManager`。
- 学习日边界为本地早上 8 点。
- `PlanManager` 只保存 `weekly` 和 `monthly`；导入的日级事项进入 `TaskManager`。
- `GoalManager` 支持多目标并在首页同时渲染。
- 白噪音和学科中心的 HTML、JS、导入、同步和新导出字段已经移除。
- 计时结束使用 Web Notification 和独立短提示音，不使用振动 API。
- 顶部按钮使用本地 Lucide SVG sprite，许可在 `icons/LUCIDE-LICENSE.txt`。

## 兼容迁移

- 旧 `studyPlans` 中的 `daily` 项迁移为任务。
- 被移除的旧计划首次迁移时备份到 `legacyPlansV110`。
- 旧 `subjects`、`audioSettings` 等键不主动删除，避免破坏用户历史；新版不再读取、同步或导出。

## 发布前命令

```bash
npm run check:js
npm test
npm run build:single
npm run dist:win
```

Windows 无法完成 Apple notarization。Mac 正式包应在 macOS 构建机配置 Developer ID 与公证凭据后生成。

## Windows 轻量版维护

- 启动器源码：`tools/LightweightLauncher.cs`。
- 发布业务文件：`index.html`、`css`、`js`、`vendor`、`shared`、`server`、`icons`、`manifest.webmanifest`、`sw.js`。
- 本地服务固定使用 `127.0.0.1:43110`，归档数据保存在 `E:\虚拟自习室\学习数据\Windows归档`。
- Edge 独立配置保存在轻量版目录的 `EdgeData`；磁盘缓存重定向至系统临时目录。
- 不要删除 `E:\虚拟自习室\学习数据`，这是用户学习数据。
- 编译命令使用 .NET Framework 4 的 `csc.exe /target:winexe /win32icon`，当前启动器包含新 ICO 后约 79 KB。图标源文件为 `icons/app-icon-v2.svg`，Windows 图标为 `icons/app-icon-v2.ico`。

## 顶部与复盘结构

- 顶部只显示 `btn-reviews`、`btn-panorama`、`btn-more`；其他原 ID 均保留在更多菜单中，所以各模块事件绑定仍兼容。
- `btn-import-hub` 打开“导入与模板”，`btn-download-templates` 位于同一弹窗内。
- 复盘中心包含 `today` 与 `history` 两页签；`history` 已改为迷你日历，过去日期查复盘、未来日期编辑待办。
- `sessionReviews` 保存每个番茄钟的独立复盘；`dailyReviews` 保存每项任务在每个学习日的任务完成复盘；两者都允许跳过。
- 番茄结束自动调用 `ReviewManager.openForSession(session, callback)`；保存或跳过后 callback 才安排自动休息。
- 任务完成调用 `ReviewManager.onTaskCompleted(task)` 并自动打开任务复盘；全部任务完成后只提示，不自动打开复盘中心。每日总结必须由用户主动进入复盘中心。
- 今日收尾保存 `tasksSnapshot`、`sessionsSnapshot`、`reviewsSnapshot`、`sessionReviewsSnapshot`，保证历史详情不依赖当前任务列表。
- 明日提醒由 `TaskManager.syncReviewReminders(sourceDate, targetDate, lines)` 同步为下一学习日的普通任务，重复保存不会产生重复项。
- 未来日历待办使用任务字段 `date`，到该学习日早上 8 点后由现有 `getVisibleTasks()` 自动显示。
- 2026-08-16 日历可用性修复：翻月或直接选月时，选中日期与右侧详情同步到可见月份；支持月份输入以及方向键、Home/End、PageUp/PageDown 导航。
- 日历按月份实际需要渲染 5/6 周，并显示当月复盘/待办摘要；状态同时使用“复/办”文字和颜色，避免只靠微小色点。
- 375px 实测日期触控目标最小 44.76×46px、未来待办按钮 44px；768px 平板改为上下布局，避免双栏把日期格压缩到 35px；浅色/深色均无横向溢出。

## 1.2.0 验证记录

- JavaScript 静态语法检查通过。
- Node 自动化测试 12/12 通过。
- 浏览器真实交互通过：新建今日任务、每日坚持打卡、番茄钟任务选择、多个目标、周/月计划精简。
- 全景模式截图检查通过：圆环与数字不重叠。
- 轻量版窗口、静态页面和归档健康接口复验通过；业务程序体积 1.39 MB。
- 真实 1 分钟番茄钟完成、单次复盘、自动休息、任务完成复盘、日终自动汇总、明日提醒和未来日历待办均通过。
- 375px 复盘日历无横向溢出，浏览器控制台无应用错误。
- 历史日历详情支持修改既往单次复盘和任务复盘，编辑结果会同步到对应日终快照。
- 1.2.1 严格审计后 Service Worker 缓存升级为 `virtual-study-room-v15`，关键业务脚本使用 `v=20260816-5` 缓存标识。
- 删除专注记录会级联复盘、日终快照、任务番茄计数和分钟统计，自动化测试增至 14 项。
- npm 依赖审计为 0 漏洞；Electron 43.4.0、electron-builder 26.15.3。
- 1.3.0 修复跨源预检后，Mac/平板可向 Windows 上传；`/api/v1/aggregate` 汇总全部不可变快照并按记录 ID 去重。
- 复盘中心升级为今日整合、每日档案和每周报告完整界面；DeepSeek Key 永不进入同步，周报正文加入归档字段。
- 1.3.0 自动化测试为 16 项，Service Worker 使用 `virtual-study-room-v19`，跨端与复盘脚本缓存标识为 `v=20260816-9`。

# 虚拟自习室 Agent 交接与迭代记录

> 给后续接手项目的 Codex/Agent 看：每次完成更新后，请同步维护本文件。

## 维护规则

- 每次功能更新、修复、打包后，在「更新记录」顶部追加一条记录。
- 记录至少包含：日期、改动范围、涉及文件、数据结构/localStorage 变化、接口或配置变化、验证方式、下一步建议。
- 如果修改了 `index.html` / `css/` / `js/`，需要同时确认 `虚拟自习室.html` 单文件版和桌面压缩包是否需要重建。
- 不要删除旧记录。旧记录是后续排查问题的上下文。

## 项目概览

这是一个纯静态的虚拟自习室网页应用，主要面向考研/雅思/长期学习监督。

核心能力：

- 番茄钟与全景专注模式
- 白噪音/BGM
- 每日任务、固定任务、计划导入、整表删除
- 48 格半小时滑动式时间规划
- 学科栏目、学科目标、学科导入
- 武汉理工样式课表导入与空闲时间展示
- 多目标倒计时/坚持天数
- 专注统计、科目时间饼图、趋势分析
- 每任务复盘、每日收尾复盘、DeepSeek API 点评通道
- 模板一键下载

## 文件结构

- `index.html`：主页面结构，所有按钮和面板入口。
- `css/style.css`：整体布局、主题、全景模式、计划/统计/复盘样式。
- `js/app.js`：应用初始化、导航、主题、内部刷新、学习日边界、总览刷新。
- `js/timer.js`：番茄钟、会话命名、大任务方向、小任务内容、会话落库。
- `js/tasks.js`：每日任务、固定任务、完成状态、7 点学习日刷新。
- `js/plans.js`：学习计划导入、整表删除、今日/周/月/阅读计划、48 格时间分配。
- `js/subjects.js`：学科目标、每日进度、学科导入、学科统计。
- `js/courses.js`：课表导入、周课表、空闲时间。
- `js/goals.js`：多个目标倒计时、考试日期目标、坚持天数目标。
- `js/reviews.js`：任务小复盘、每日收尾、DeepSeek 点评、复盘导出。
- `js/stats.js`：专注统计、图表、历史记录、数据导出/清空。
- `js/audio.js`：白噪音和 BGM 合成。
- `js/background.js`：风景背景和背景轮换。
- `js/templates.js`：Excel 模板生成和下载。
- `docs/使用说明.md`：给用户看的中文使用说明。
- `docs/specs/`：早期设计/需求文档。
- `outputs/`：打包产物和模板文件。
- `虚拟自习室.html`：单文件版，适合直接双击打开。

## 本地数据约定

数据全部存在浏览器 `localStorage`，没有后端数据库。清理浏览器站点数据会删除记录。

主要键：

- `appSettings`：主题、背景、全景/界面偏好等应用设置。
- `timerSettings`：番茄钟时长、休息时长等。
- `audioSettings`：当前音频、音量、播放状态。
- `tasks`：每日任务和固定任务。导入计划生成的任务会带 `importSource` / `planId`。
- `studyPlans`：导入或手动创建的每日/周/月/阅读计划。
- `subjects`：学科配置、目标、每日任务量、时间安排。
- `currentSubjectId`：当前选中的大任务/学科方向。
- `courses`：课表导入结果。
- `studyGoals`：多个考试/坚持目标。
- `currentStudyGoal`：当前展示的目标。
- `dailyData`：今日番茄次数、专注分钟、当前学习日。
- `focusSessions`：每次完成的专注会话，用于历史、统计和科目饼图。
- `focusActivity`：按学习日汇总的专注活跃数据。
- `dailyReviews`：每个任务完成后的短复盘。
- `dailyCloseEntries`：每日收尾复盘。
- `dayClosePromptedDate`：当天是否已经弹过收尾弹窗。
- `deepseekSettings`：DeepSeek/OpenAI 兼容接口地址、模型和 API Key。

学习日边界：

- 使用 `App.getStudyDateKey()` 计算当前学习日。
- 每天早上 7 点后进入新学习日，用于固定任务刷新和连续天数统计。

## 模块接口速查

这些对象挂在全局作用域，由 `app.js` 初始化或互相调用：

- `App.init()`：启动应用。
- `App.refreshPage()`：内部刷新按钮使用，刷新页面但保留本地数据。
- `App.getStudyDateKey(date?)`：返回按早 7 点切分的日期键。
- `TimerManager.start()` / `pause()` / `reset()` / `toggle()`：番茄钟控制。
- `TimerManager.complete()`：完成一次专注并写入 `focusSessions`。
- `TaskManager.refreshDailyState()`：刷新每日/固定任务状态。
- `PlanManager.importFile(file)`：导入学习计划表。
- `PlanManager.deleteSource(sourceFile)`：删除某次导入的整张计划表及其关联任务。
- `PlanManager.assignTimeGrid()`：把 48 格时间选择分配给任务。
- `SubjectManager.importFile(file)`：导入学科目标表。
- `CourseManager.importFile(file)`：导入课表。
- `GoalManager.save()`：保存多个倒计时/坚持目标。
- `ReviewManager.openDayClose(auto?)`：打开每日收尾弹窗。
- `ReviewManager.analyzeWithDeepSeek()`：调用 DeepSeek 兼容接口生成点评。
- `Stats.refresh()`：刷新统计图表。
- `TemplateManager.download(type)`：生成并下载一键导入 Excel 模板。

## 打包约定

当前交付物放在桌面：

- `/Users/chenyc/Desktop/虚拟自习室.html`
- `/Users/chenyc/Desktop/虚拟自习室-最新版.zip`
- `/Users/chenyc/Desktop/虚拟自习室-一键导入模板.xlsx`

如果只改文档：

- 不需要重建 `虚拟自习室.html`。
- 需要重新压缩 `虚拟自习室-最新版.zip`，确保文档被带上。

如果改了网页功能：

- 需要检查模块版 `index.html`。
- 需要重建单文件版 `虚拟自习室.html`。
- 需要重新复制到桌面并更新 zip。

## 已知限制

- 当前工作目录不是 Git 仓库，不能直接提交或 push 到 GitHub；需要用户提供可写仓库目录或授权/登录后的 GitHub 操作环境。
- Chart.js、SheetJS、背景图依赖网络 CDN；无网络时核心计时/任务仍可用，但图表和 Excel 解析可能受影响。
- DeepSeek API Key 保存在浏览器本地，适合个人使用；不要把带 Key 的浏览器数据导出给别人。
- 单文件版和模块源码需要保持同步，后续改功能时不要只改其中一个。

## 更新记录

### 2026-08-12 - Windows 程序与数据迁移到 E 盘

- `main.js` 支持用户环境变量 `VSR_DATA_ROOT` 及优先级更高的 `--vsr-data-root=...` 启动参数；Windows Electron 在启动早期将 `userData` 指向其 `应用数据` 子目录，并将权威归档指向 `Windows归档` 子目录。
- 本机目标为 `E:\虚拟自习室\程序` 与 `E:\虚拟自习室\学习数据`，迁移时先复制核验再清理 C 盘旧副本。

### 2026-08-12 - Windows / macOS 实机构建安装与跨机同步

- Windows x64 便携版构建并限时启动成功；产物位于 `outputs/installers/虚拟自习室 1.1.0.exe`。
- Apple Silicon arm64 DMG/ZIP 构建成功，Mach-O 架构确认 `arm64`；应用已复制到 Mac 的 `/Applications/虚拟自习室.app`，本机 ad-hoc 深度签名、解除隔离后启动成功。
- macOS 包没有 Developer ID 与 Apple 公证，Gatekeeper 仍不会把它视作可公开分发的可信安装包；当前安装方式仅适用于已验证的这台 Mac。
- Mac 经 Tailscale 向 Windows 临时归档服务上传 367 字节测试快照；Mac 原文件、durable 回执与 Windows 落盘文件 SHA-256 均为 `18c8e489198ca96790e0272335e1b294d857a19d16918cee7b0c920cc3910966`。

### 2026-08-12 - 顶部刷新键改为继续计时

- 顶部 `↻` 不再重载页面；计时暂停或尚未开始时点击会继续/开始当前计时。
- 计时正在运行时点击不会暂停，只提示“计时正在进行中”。
- 按钮提示和无障碍名称已改为“继续计时”。

### 2026-08-12 - 手机 / 平板 / macOS 客户端与 Windows 权威归档

改动方向：

- 保留现有 Vanilla JS/PWA 业务，新增手机与平板响应式触控布局；375px、768px 无页面级横向溢出，可见按钮至少 44px。
- Windows Electron 启动 Node 归档与静态资源服务；也可用 `npm run archive:win` 独立启动，默认端口 `43110`、默认数据目录 `%USERPROFILE%\Documents\虚拟自习室数据`。
- macOS Electron 作为同步客户端，不启动归档服务；新增 x64、arm64 构建入口。
- 新增 v1 API：匿名健康检查、授权上传、归档列表/下载、仅回环本机配置。
- 客户端在打开、联网、回前台与定时间隔时上传，失败退避且不阻塞本地计时/保存。
- Windows 按设备保存不可变快照，原子落盘后重新计算 SHA-256，再返回 durable receipt。
- 客户端只在 durable receipt 与本次上传哈希一致时清理，且只删除超出保留期、仍与上传快照完全一致的专注/复盘/每日收尾历史；每天最多一次。
- 恢复归档前校验下载哈希，触发当前本机安全备份下载并进行二次确认。
- 自动归档和手工导出均剔除 DeepSeek API Key、同步 token 和其他凭据。

涉及文件：

- `shared/archive-core.js`
- `server/archive-server.js`、`server/archive-store.js`、`server/windows-archive.js`
- `js/sync.js`、`index.html`、`css/style.css`、`sw.js`、`main.js`
- `package.json`、`manifest.webmanifest`
- `test/archive-core.test.js`、`test/archive-server.test.js`、`test/http-smoke.mjs`
- `tools/check-js.mjs`、`tools/build-single-file.mjs`
- `README.md`、`docs/设备同步快速说明.md`、`虚拟自习室.html`

数据结构 / localStorage：

- `syncSettings`：服务地址、token、设备名/deviceId、自动同步、间隔、保留期和自动清理设置（仅本机，不进入快照/导出）。
- `syncDeviceId`：稳定客户端 ID（仅本机）。
- `syncState`：最近回执、错误、清理日期与数量（仅本机）。
- 自动归档 schema 为 `3`，手工 JSON 保持 schema `2` 兼容。

验证：

- `npm test`：11 项通过，覆盖凭据剔除、无回执不清理、编辑后不误删、重复记录计数交集、认证、合法落盘/哈希、非法 schema/device/body、远程 local-config、路径穿越和静态白名单。
- `npm run check:js`：26 个 JS/MJS 文件通过。
- `npm run smoke:archive`：真实 HTTP 上传、落盘、列表/下载与哈希通过。
- 应用内浏览器：375px、768px、桌面页面加载和同步面板通过；真实上传返回回执并在 Windows 临时目录生成归档；控制台无错误。
- `npm run build:single`：单文件版重新生成，自动网络同步在 `file://` 下明确禁用，手工导入导出保留。

已知限制：

- 普通 LAN HTTP 可学习和同步，但完整 PWA 安装/Service Worker 离线重开需要受信任 HTTPS。
- iOS/Android 完全关闭页面后不能后台同步，只会在重新打开/联网/回前台后补传。
- macOS 安装包必须在 Mac 上真实构建验证；未签名构建不适合公开分发，签名与公证尚未配置。
- 2026-08-12 Apple Silicon Mac 实机核验：ZIP SHA-256 与 Windows 一致；纯逻辑测试 6/6、`check:js`（26 文件）及 `build:single` 通过。该受限执行环境禁止回环端口监听（HTTP 测试统一 `EPERM`），且 DNS 无法解析 `registry.npmjs.org`（`ENOTFOUND`），未能安装 `electron`/`electron-builder`，因此 arm64 Electron 启动和 DMG/ZIP 构建仍未完成，不能标记为已验证产物。
- 当前是单向不可变归档与显式恢复，不是冲突合并或实时协作。

### 2026-08-09 - 项目问题清单归档

改动方向：

- 将最新的整体审查结果整理为独立问题清单，便于后续持续迭代。
- 明确当前最需要优先处理的五类风险：字段重叠、覆盖式备份、离线依赖、入口膨胀、单文件一致性。

涉及文件：

- `docs/项目问题清单.md`
- `AGENT_HANDOFF.md`

验证：

- 已写入 `docs/项目问题清单.md`。
- 已同步到交接记录。

下一步建议：

- 按问题清单优先做 schema 收口和保存视图，而不是继续加入口。

### 2026-08-09 - 项目合理性审查与备份版本化

改动方向：

- 对整个项目的数据组织、功能边界和后续演进方式做了一轮系统审查。
- 给导出备份增加 `schemaVersion`，导入时识别版本号，提升后续兼容性。
- 新增独立审查文档，专门记录项目结构合理性、风险点和后续建议。
- 补齐单文件版缺失的 `import-hub`、`sync`、`reviews`、`stats` 主链模块，避免导入/备份/复盘/统计链路断开。

涉及文件：

- `js/stats.js`
- `js/sync.js`
- `js/import-hub.js`
- `js/reviews.js`
- `docs/使用说明.md`
- `docs/项目合理性审查.md`
- `AGENT_HANDOFF.md`

数据结构/localStorage：

- 本机 `localStorage` 键未改名。
- 导出 JSON 新增顶层字段 `schemaVersion: 2`。
- 单文件版重新补齐 `ImportHub`、`SyncManager`、`ReviewManager`、`Stats`，与模块版行为对齐。

验证：

- 已通过 `node --check`。
- 已将审查文档写入 `docs/项目合理性审查.md`。
- 已同步到桌面源码镜像与完整资料目录。

下一步建议：

- 继续把“计划”和“任务”的职责边界再收紧一点。
- 给标签做治理层，避免后续分类膨胀后变乱。
- 如果以后还要加同步，优先做版本迁移，而不是先堆 UI。

### 2026-08-09 - 多级分类与 Tag 系统

改动方向：

- 任务新增分类路径输入，使用 `一级/二级/三级` 表示多级结构。
- 任务新增逗号分隔标签并在任务条目中显示 Tag 徽标。
- 任务面板新增分类筛选，自动展开父级分类，例如 `考研/数学/高数` 会生成 `考研`、`考研/数学`、`考研/数学/高数` 三级筛选项。
- 计划导入支持可选列“分类路径”和“标签”，生成的每日任务会继承这些字段。
- 一键下载的 Excel 模板已加入“分类路径”和“标签”列。

涉及文件：

- `index.html`
- `css/style.css`
- `js/tasks.js`
- `js/plans.js`
- `js/templates.js`
- `docs/使用说明.md`
- `docs/模板导入说明.md`
- `虚拟自习室.html`

数据结构/localStorage：

- `tasks[]`、`studyPlans[]` 可新增 `categoryPath: string` 和 `tags: string[]`。
- 旧数据没有上述字段时仍可正常使用。

验证：

- 源码版和单文件版已同步。
- 全部 JavaScript 已通过 `node --check`。

下一步建议：

- 标签统计：按 Tag 汇总专注时长、完成率和复盘率。
- 智能视图：保存“数学 + 真题 + 未完成”等组合筛选。
- 标签治理：合并同义标签、检测重复拼写和长期无使用标签。

### 2026-08-09 - 整理中文说明书与完整资料文件夹

改动方向：

- 新增模板导入说明和完整资料目录说明。
- 将中文说明、同步说明、模板说明、开发交接记录、单文件版、源码、压缩包和 Excel 模板统一整理到桌面“虚拟自习室-完整资料”文件夹。

涉及文件：

- `docs/使用说明.md`
- `docs/设备同步快速说明.md`
- `docs/模板导入说明.md`
- `docs/完整资料目录说明.md`

验证：

- 已检查桌面资料文件夹的目录和文件。
- 已重新打包并通过 `unzip -tq` 校验。

### 2026-08-09 - 月 / 周 / 日计划推进概览

改动方向：

- 计划窗口新增“今日 / 本周 / 本月”三张推进卡，显示完成数和完成百分比，可直接切换对应页签。
- 主页面本周计划卡片增加完成数和完成百分比。
- 计划列表顶部进度从单纯数量改为“已完成 / 总数 · 百分比”。

涉及文件：

- `index.html`
- `css/style.css`
- `js/plans.js`
- `虚拟自习室.html`

数据结构/localStorage：

- 不新增字段，继续使用 `studyPlans.completed`、`tasks.completed` 和每日学习日边界。

验证：

- 源码版和单文件版均同步了同一份 `PlanManager` 逻辑。
- 全部 JavaScript 已通过 `node --check`。

### 2026-08-09 - 导入快捷键与同步说明书

改动方向：

- 增加 `Ctrl + Shift + I` 快速打开设备同步导入窗口。
- 增加 `Ctrl + Shift + E` 快速导出完整数据。
- 新增 `docs/设备同步快速说明.md`，解释安卓导出、Windows 导入、文件传输和限制。

涉及文件：

- `js/app.js`
- `docs/设备同步快速说明.md`
- `docs/使用说明.md`
- `虚拟自习室.html`

接口或配置：

- 快捷键调用 `SyncManager.open()` 和 `Stats.exportData()`，不新增数据结构。

验证：

- 已通过全部 `js/*.js` 的 `node --check`，并同步桌面包。

### 2026-08-09 - 安卓 / Windows 跨平台安装与手动同步

改动方向：

- 顶部功能按钮统一显示中文文字标签，不再只有图标。
- 增加 PWA manifest 和 service worker，部署到 HTTPS 后可安装到 Android 主屏幕和 Windows 桌面。
- 增加“设备同步”窗口：安卓端导出完整 JSON，Windows 端导入后覆盖本机数据。

涉及文件：

- `index.html`
- `css/style.css`
- `js/sync.js`
- `js/app.js`
- `manifest.webmanifest`
- `sw.js`
- `虚拟自习室.html`

数据结构/localStorage：

- `SyncManager` 导入/导出沿用 `Stats.exportData()` 的完整字段，不新增存储键。
- 导入前明确提示会覆盖当前浏览器本地数据。

接口或配置：

- 新增 `SyncManager.init()`、`SyncManager.importFile(file)`。
- PWA 仅在 HTTP/HTTPS 环境注册；双击 `file://` 仍可使用，但不能安装离线应用。

验证：

- 已通过全部 `js/*.js` 的 `node --check`。
- 已同步单文件版、源码和桌面压缩包。

已知边界：

- 当前项目没有后端数据库，因此不能在两台设备之间自动实时同步；现版本采用最稳妥的 JSON 备份迁移。要实时同步，需要后续接入 Supabase、Firebase 或自建 API。

### 2026-08-09 - 统一导入、周计划主页面展示与记录删除

改动方向：

- 新增顶部“📥”一键导入窗口，可从同一个完整 Excel 模板勾选导入计划、学科和课表。
- 修正完整模板中的“任务内容 / 类型 / 时长分钟 / 学科”字段识别，按行生成每日、每周、月度和阅读计划。
- 主页面右侧新增本周计划预览，点击可直接打开计划窗口的“本周”页签。
- 每条计划增加删除按钮，删除时同步移除关联的每日任务；原有整张表删除仍保留。

涉及文件：

- `index.html`
- `css/style.css`
- `js/import-hub.js`
- `js/app.js`
- `js/plans.js`
- `虚拟自习室.html`

数据结构/localStorage：

- 不新增存储键；计划仍写入 `studyPlans`，每日任务仍写入 `tasks`。
- 单条删除依据 `planId` 同步清理关联任务。

接口或配置：

- 新增 `ImportHub.init()` / `ImportHub.importAll()`。
- `PlanManager.deletePlan(planId)` 新增单条计划删除接口。

验证：

- 已通过全部 `js/*.js` 的 `node --check`。
- 已同步单文件版并重新生成桌面压缩包。

下一步建议：

- 如果导入文件来自非模板格式，可再增加“表头映射预览”，让用户在确认前手动指定列。

### 2026-08-09 - 复盘增加学科完成率

改动方向：

- 每日复盘摘要按学科/大任务方向显示“已复盘/已完成任务”比例。
- 每日 Markdown 导出新增“学科复盘完成率”章节，便于判断哪一科只完成了任务但没有形成闭环。

涉及文件：

- `js/reviews.js`
- `虚拟自习室.html`
- `AGENT_HANDOFF.md`

数据结构/localStorage：

- 不新增字段；统计使用任务上的 `subjectName` / `subject` / `category`，缺失时归为“未分类”。

接口或配置：

- 新增 `ReviewManager.getSubjectReviewSummary(tasks, reviews)`，仅供复盘摘要和导出复用。

验证：

- 已通过全部 `js/*.js` 的 `node --check`。
- 已同步单文件版，待重新打包桌面压缩包。

下一步建议：

- 如需更强监督，可在统计页增加按学科的周/月复盘完成率趋势。

### 2026-08-08 - 修复日期边界、导入归属和导出完整性

改动方向：

- 统一学习日边界：复盘、学科统计和趋势统计都改为跟随 `App.getStudyDateKey()` 的早 7 点切分。
- 修复番茄钟日期刷新定时器的重复注册，避免页面长开后不断叠加 interval。
- 修复跨日后今日专注分钟不重置的问题。
- 让导入生成的每日任务继承当前学科归属，恢复学科进度统计。
- 把数据导出改成更接近完整备份的结构。

涉及文件：

- `js/timer.js`
- `js/reviews.js`
- `js/subjects.js`
- `js/stats.js`
- `js/plans.js`
- `js/app.js`

数据结构/localStorage：

- 导入生成的 `tasks` 会补充 `subjectId`、`subject`、`subjectName` 和 `category`，便于学科统计。
- `exportData()` 输出增加 `subjects`、`courses`、`studyGoals`、`dailyReviews`、`dailyCloseEntries`、`appSettings`、`audioSettings`、`deepseekSettings`、`currentSubjectId`、`currentStudyGoal`、`dayClosePromptedDate`、`timerSettings`。
- 学习日相关读取统一跟随 7 点切分，不再混用自然日。

接口变化：

- `ReviewManager.todayKey()`、`SubjectManager.todayKey()` 和 `Stats.getDayKey()` 现在都优先走 `App.getStudyDateKey()`。
- `PomodoroTimer.init()` 现在只挂一个日期刷新 interval。
- `Stats.exportData()` 现在导出更完整的本地状态。

验证：

- 已重新检查相关模块的语法。
- 已同步检查时间边界调用链和导出字段。

下一步建议：

- 若后续继续优化，可以把“导入计划时的学科映射”做成显式选择，而不是完全依赖当前学科。

### 2026-08-08 - 完善复盘编辑与待复盘队列

改动方向：

- 让已完成任务的复盘可以回头编辑，不再一旦写过就无法调整。
- 在每日复盘里把待复盘任务单独拉出来，方便集中补齐。
- 支持删除单条复盘，避免错误记录一直挂着。
- DeepSeek 点评和导出内容加入待复盘任务信息。

涉及文件：

- `js/reviews.js`
- `docs/使用说明.md`
- `AGENT_HANDOFF.md`

数据结构/localStorage：

- `dailyReviews` 仍沿用原结构，但编辑复盘会沿用原 `id`，不再生成重复记录。
- 导出 JSON 增加 `pendingTasks`。

接口变化：

- 新增 `ReviewManager.getReviewForTask(taskId, date?)`。
- 新增 `ReviewManager.getPendingTasks()`。
- 新增 `ReviewManager.deleteReview(reviewId)`。
- `ReviewManager.openForTask(task)` 现在可加载已有复盘继续编辑。

验证：

- 已更新复盘面板的交互逻辑。
- 已同步单文件版与桌面压缩包。

下一步建议：

- 可以继续加“复盘模板库”或“按学科/计划来源统计复盘完成率”，让复盘更像监督面板，而不是纯文本表单。

### 2026-08-08 - 增加 Agent 交接文档

改动方向：

- 按用户要求，加入本文件，用于记录每次更新内容、更新方向、接口和后续迭代注意事项。
- 给后续 agent 提供项目结构、localStorage 数据键、模块接口、打包约定和已知限制。

涉及文件：

- `AGENT_HANDOFF.md`
- `README.md`

数据结构/localStorage：

- 无新增数据结构。
- 无新增 localStorage 键。

接口变化：

- 无运行时代码接口变化。
- 新增文档约定：后续每次更新后必须维护本文件。

验证：

- 确认文档已加入项目根目录。
- 确认桌面最新版压缩包包含本文件。

下一步建议：

- 下一次功能开发优先处理：全景模式体验细节、考研监督维度、DeepSeek 点评提示词可调、导入失败原因提示、统计导出增强。

### 2026-08-08 - 最近一次功能批次概览

改动方向：

- 修复全屏/全景模式右上角末尾按钮不可用。
- 增加内部刷新按钮，缓解页面卡死时只能重开文件的问题。
- 番茄钟开始前可确认本次名称，并区分大任务方向与小任务内容。
- 科目/大方向专注时间进入饼图统计。
- 多目标倒计时支持考试日期和坚持天数，不再只有单一目标。
- 每日固定任务按早上 7 点刷新。
- 48 格时间分配的任务选择与保存流程修复。

主要涉及文件：

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/timer.js`
- `js/tasks.js`
- `js/plans.js`
- `js/goals.js`
- `js/stats.js`

数据结构/localStorage：

- `focusSessions` 中会话记录包含 `subjectId`、`subjectName`、`sessionName` 等字段，用于饼图统计。
- `studyGoals` 支持多个目标。
- `tasks` / `studyPlans` 使用学习日边界刷新每日状态。

验证：

- 运行 JavaScript 语法检查。
- 通过本地 HTTP 服务做基础页面 smoke test。
- 已重新生成桌面单文件版和压缩包。

### 2026-08-09 - 代码审查修复批次（P0/P1 全部）

背景：对 12345 文件夹内多个副本进行全量审查，发现版本混乱与若干 bug。决定只保留本目录为唯一权威版本（删除 最新版_副本、完整资料_副本、根目录旧 html/zip），并修复以下问题。

改动方向：

- **PWA 真正可用**：`sw.js` 重写为 versioned cache（v2）+ `skipWaiting`/`clients.claim` + activate 清理旧缓存 + 导航请求 network-first（解决改版后永远加载旧版的问题）。
- **PWA 可安装**：`manifest.webmanifest` 补 `icons`（新增 `icons/icon-192.png`、`icon-512.png`，纯 Python 生成）和 `scope`；`index.html` 补 `theme-color` meta 与 favicon。
- **单文件版修复**：之前 `虚拟自习室.html` 缺失 `PlanManager` 和 `GoalManager` 模块（计划功能和目标倒计时不可用），已新增 `tools/build-single-file.mjs`（node 版）+ 以 Python 等价逻辑重新内联打包，15 个模块全部包含并通过语法校验。
- **localStorage 写入安全**：新增 `js/storage.js`（SafeStore.set/get/remove），全部数据写入迁移到 SafeStore，配额超限（QuotaExceededError）时 toast 提示而非静默丢失。
- **计划导入学科归属错位**：`plans.js` `commitPending()` 改为按计划行的“学科/科目”列匹配学科（此前一律用当前选中学科，统计错位）。
- **计时器**：`timer.js` 自动开始休息的 setTimeout 增加 generation 防竞态（窗口期内点重置不再误启动休息）；`recordSession()` 增加跨天守卫。
- **课表**：`courses.js` 中文数字解析支持“十一、十二、十三”组合（晚课节次此前被解析成 0-0）；节次缺失不再静默回退到第一节，改为跳过并提示。
- **数据备份**：`stats.js` 导出剔除 `deepseekSettings.apiKey`（Key 不再随备份经微信等通道外泄），并去掉重复字段 `settings`。
- **一键导入**：`import-hub.js` 各导入方法返回真实计数，失败不再误报“导入完成”。
- **快捷键**：`app.js` 空格键排除 BUTTON/SELECT 焦点（按钮聚焦时不再双重触发）。
- **学科导入**：`subjects.js` 数字字段支持导入 0 清空、颜色值校验 `#hex`。
- **清理死代码**：`plans.js` 重复的 `if (!window.XLSX)`、未使用的 `weeklySheet`、正则重复项；`tasks.js?v=20260730-review` 统一为 `?v=20260809`。
- **CSS**：补 `.plan-sources.hidden` 规则（此前空区仍显示）。

数据结构/localStorage：

- 新增 `js/storage.js`（SafeStore 封装，无数据结构变化）。
- 导出备份仍为 `schemaVersion: 2`，`deepseekSettings` 导出时剔除 `apiKey` 字段。

验证：

- 用系统 JavaScriptCore（osascript -l JavaScript）对全部 JS 模块和单文件版 15 个内联脚本块做语法校验，0 错误。
- 单文件版包含全部 15 个模块定义（SafeStore/Background/AudioEngine/PomodoroTimer/TemplateManager/SubjectManager/CourseManager/TaskManager/PlanManager/ImportHub/SyncManager/ReviewManager/Stats/GoalManager/App）。
- README 已更新：结构清单、PWA/离线说明、单文件版打包方法。

下一步建议：

- 正式把本目录纳入 Git 管理，停止“副本+压缩包”式的版本控制。
- 后续修改 `index.html`/`css/`/`js/` 后运行 `node tools/build-single-file.mjs` 重建单文件版。
- 已删除的旧副本如需找回，见桌面废纸篓/备份。

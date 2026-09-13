# EasyRead Privacy Policy / 隐私政策

Effective date / 生效日期: 2026-09-13. Applies to EasyRead 2.0.0 for Microsoft Edge.

## English

### Purpose and local storage

EasyRead helps you save, organize, annotate and revisit web content. It does not require an EasyRead account and does not operate an analytics, advertising, or cloud-sync service. The extension does not upload your reading database to its developer.

Depending on enabled features and your actions, EasyRead processes and stores the following in the extension's local browser storage (`chrome.storage.local`):

- Web addresses, page titles, visit times and counts, read-later status and reading history.
- Reading/scroll positions, reading time and observed video playback progress. Recorded video progress is not used to seek or resume videos automatically.
- Quoted webpage text, highlights, notes, optional author names you enter, and text-position hints needed to restore notes.
- Preferences and migration backups used to preserve records from earlier versions.
- If Diagnostic Tool is enabled (off by default), local error reports including error messages, stacks, causes, processing stages and page/resource URLs. Reports can contain sensitive context despite attempts to redact common credential fields. Review them before sharing. Turning diagnostics off stops collection but does not delete existing reports.

EasyRead also accesses page text, images, styles, frames and media URLs to provide saving and preview functions. Captures, screenshots and media bytes are processed locally and exported to files or the clipboard when requested. Such files may contain private page content; choose carefully what to save and share. EasyRead is not designed to collect passwords, health records or financial information as separate data categories, but content you choose to save may itself contain sensitive information.

### Network requests and third parties

Local-first does not mean offline. Page saving may fetch images, stylesheets, fonts and frame resources from their original sites/CDNs. Media discovery, metadata/size checks, previews and downloads may contact the relevant website, player provider or CDN. Some previews use an embedded provider player, such as Vimeo. Autoplay behavior follows your media preferences. These providers receive ordinary request information, such as your IP address, requested resource, browser headers and, where applicable, referrer and existing site-session cookies. Their privacy policies apply to their services.

Requests needed by these features are not uploads of your reading-history or notes database. Optional host permissions are requested for cross-origin features; some HTML capture operations request broad HTTP(S) access, while media operations may request specific provider/CDN origins. You may decline or revoke optional permissions, which can limit capture or download completeness. Temporary request-header rules can supply a media provider's required referrer during a requested download and are cleaned up after the operation.

EasyRead does not sell reading data, use it for advertising, or use it to determine creditworthiness or lending eligibility. It does not automatically send diagnostic reports to the developer. If you choose to contact support or share an export/report, the information you send will be disclosed to that recipient and the service you use to send it. Public issue reports are visible to others; do not include private data or access tokens.

### Your controls and retention

You can view, edit or delete records and notes, change automatic recording and media preferences, and export/import backups using EasyRead's interfaces. Disabling visual highlights does not delete notes. Clipboard content is written only through a Copy action; EasyRead does not read the clipboard. You can manage site access through Microsoft Edge's extension controls.

Local records remain until removed through available controls or the browser's extension-data removal mechanisms. Legacy migration backups may retain earlier copies; deleting a visible record does not necessarily erase an earlier backup. Uninstalling the extension removes its browser-managed local extension data. Exported files, downloaded reports and backups outside the browser remain until you delete them yourself. Protect your device, browser profile and backup files; EasyRead does not provide its own encrypted vault or remote recovery service.

### Changes and contact

This policy will be updated when EasyRead's data practices change. Contact the maintainer at **eeee6688@hotmail.com** or through [the project repository](https://github.com/volnet/chrome-extensions-easyread). Microsoft Edge and the extension store independently process information under their own policies.

## 简体中文

### 用途与本地存储

EasyRead 用于保存、整理、标记和重新阅读网页内容，不要求注册 EasyRead 账户，不提供统计分析、广告或云同步服务，也不会将阅读数据库上传给开发者。

根据启用的功能和你的操作，扩展会在浏览器扩展本地存储（`chrome.storage.local`）中处理、保存：网页地址、标题、访问时间和次数、稍后阅读状态、浏览历史、阅读时间及滚动位置、观察到的视频播放进度；引用原文、重点、笔记、自行填写的作者名字和恢复定位所需的文本线索；设置以及用于兼容升级的历史数据备份。视频进度仅作记录，不会自动跳转或恢复播放。

“诊断工具”默认关闭。开启后会在本地记录错误信息、完整堆栈、原因、处理阶段及网页/资源地址等上下文。虽然会尝试隐藏常见凭据字段，报告仍可能包含敏感内容，分享前请自行检查。关闭诊断停止采集，但不删除已有报告；报告不会自动发送给开发者。

保存和预览功能还会访问页面文字、图片、样式、框架及媒体地址。页面副本、截图和媒体字节在本地处理，并按操作导出为文件或写入剪贴板。保存的内容可能包含私人信息，请谨慎选择。EasyRead 不专门采集密码、健康或财务资料，但你选择保存的网页内容本身可能含有此类信息。

### 网络请求与第三方

本地优先不等于完全离线。保存网页可能请求原网站/CDN 的图片、样式、字体和框架资源；媒体探测、元数据和大小检查、预览、下载可能连接相应网站、播放器提供方及 CDN。部分预览使用提供方的嵌入播放器（例如 Vimeo），自动播放遵循你的设置。这些提供方会收到常规网络请求信息，包括 IP 地址、资源地址、浏览器请求头，以及适用时的来源地址和已有网站会话 Cookie，并按其自身隐私政策处理。

这些功能请求不是上传你的阅读历史或笔记数据库。跨域功能按需申请可选网站权限；部分 HTML 保存操作会请求较广泛的 HTTP(S) 访问，媒体操作可能申请特定提供方/CDN 域名。你可以拒绝或撤回权限，但保存或下载可能因此不完整。下载过程中可能使用临时请求头规则提供媒体服务要求的来源地址，操作结束后清理。

EasyRead 不出售阅读数据，不将其用于广告、信用评估或贷款资格判断，也不会自动上传诊断报告。若你主动向支持人员发送文件或报告，内容会提供给你选择的收件人及发送服务。公开问题报告任何人都可能看到，请勿包含私人信息或访问令牌。

### 控制与保留

你可以通过 EasyRead 查看、编辑、删除记录和笔记，调整自动记录及媒体设置，导出或导入备份。关闭重点显示不会删除笔记。只有点击复制才写入剪贴板，扩展不会读取剪贴板。网站访问权限可以在 Microsoft Edge 扩展管理中调整。

本地记录会保留至通过相应功能或浏览器扩展数据移除机制删除。历史迁移备份可能保留较早的副本，因此删除可见记录不一定同时清除旧备份。卸载扩展会移除浏览器管理的本地扩展数据；已经导出的文件、下载的报告和浏览器外的备份仍需自行删除。请保护设备、浏览器配置及备份文件；EasyRead 不提供独立加密保险库或远程数据恢复服务。

### 更新与联系

数据处理方式变化时会更新本政策。维护者联系邮箱：**eeee6688@hotmail.com**；也可访问[项目仓库](https://github.com/volnet/chrome-extensions-easyread)。Microsoft Edge 浏览器和扩展商店依据各自政策独立处理相关信息。

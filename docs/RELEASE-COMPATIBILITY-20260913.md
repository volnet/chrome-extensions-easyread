# EasyRead 2.0.0 发布兼容性检查

## 基线与范围

- 旧版：仓库 `v1.0.1`，提交 `3b044c9b6a79cc687f8b981dede3529225de5767`。
- 当前：`dist/production`；不使用 `src` 或 `dist/development` 提交商店。
- 本次没有删除用户记录，没有替换用户设置，没有新增权限，也没有上传或发布商店版本。

## 历史数据

| 数据 | 升级处理 |
| --- | --- |
| `allRecords` | 原键、URL、标题、访问时间数组、`position` 原样保留 |
| `readLaters` | 原数组、未读/阅读中/已读状态 0/1/2、时间和阅读位置保留 |
| v1.0.1 `notes` | 原文编码、ID、时间保留；缺失 ID 补稳定 ID；归入当前 Notes |
| 中间版本 `annotations` | 归入 Notes；不同内容的重复 ID 不丢弃；保留作者和定位提示 |
| 用户设置及未知字段 | 迁移只写 Notes 相关键，不覆盖其他数据或显式偏好 |

URL 规则仍为去 fragment、转小写、去首尾空格，查询参数保留，与 v1.0.1 一致。

迁移在 worker 加载、安装/升级、浏览器启动和 Notes 请求时兜底执行，通过同一队列串行化。
`notesSchemaVersion: 2` 保证重复执行不会重复导入；仍会接收后续出现的旧批注。
第一次有历史笔记时，将原始集合保存至 `notesMigrationBackupV1`；转换结果、旧集合退休和快照一次写入。
写入失败不清除旧集合；后续请求重试。删除后的笔记不会从快照自动复活。

无法从已经损坏、已被旧版本删除或截断的数据恢复不存在的信息；磁盘/存储失败也不能承诺必然成功。
此时保持原始数据，不能以“迁移完成”掩盖失败。

## 图标发布防错

- 开发：`src/assets/logo-dev` 的蓝色 Logo 映射到 `dist/development/assets/logo`。
- 生产：`src/assets/logo` 的原版橘色 Logo 复制到 `dist/production/assets/logo`。
- `verify-build-icons.mjs` 在每次构建末尾自动执行：检查 16/32/48/128/512 尺寸、manifest 与 action 引用、输出目录及蓝色图片泄漏。
- 生产图标 SHA-256 固定为 v1.0.1 Git LFS 记录中的原图哈希，不是 LFS 指针文件哈希；任一不符令构建失败。
- 主窗口、稍后阅读、设置、浏览历史、笔记侧边栏都引用统一 `assets/logo` 路径。

## 验证结果

- `npm run build:unpacked`：开发/生产构建及图标校验通过。
- `npm test`：56 项测试通过；包含旧版完整结构、迁移失败原数据保留、幂等、原文可编辑/删除、删除不复活。
- 开发中文、生产英文：隔离 Edge 完整 UI/存储/导出导入回归通过。
- 两种构建原生 action popup：各 117 帧稳定性检查通过。
- `npm run test:upgrade`：从 git archive 提取真实 v1.0.1，LFS Logo 用已核对的原图补齐；隔离浏览器写入合成旧数据，保留相同路径/扩展 ID/profile，替换生产包并调用扩展 reload。无需打开 Notes，自动迁移完成；所有旧键逐字段比较一致，旧状态在新设置页可见。
- 测试截图：`output/release-upgrade/v101-to-v200-production.png`。
- 未进行真实商店自动更新验收，没有读取或修改个人浏览器生产数据。

## 发布必守条件

1. 更新原有 Chrome/Edge 商店条目，保持原扩展身份及外部签名流程；不卸载重装，不创建新条目替代升级。
2. 仅将 `dist/production` 内文件打包，`manifest.json` 必须位于压缩包根目录；不混入开发包或私钥。
3. 当前相较 v1.0.1 已增加 clipboardWrite、downloads、scripting、webNavigation、declarativeNetRequestWithHostAccess 等权限；浏览器/商店可能要求授权确认，不能承诺权限升级也完全无感。本次没有扩大权限。
4. 在商店正式投放前进行小范围真实商店更新验证，确认权限提示、原 ID 和数据连续性。本文的隔离 unpacked 测试不能代替商店验收。

权限升级规则参考：[Chrome 官方 Permission warning guidelines](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)。新增触发警告的权限可能使扩展在用户接受前暂时禁用。

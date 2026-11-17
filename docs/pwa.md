# 网站 PWA

PWA 安装后打开 Simple Copy 官网与软件示例。浏览器示例继续使用共享 UI 和示例数据，Windows 系统剪贴板功能由桌面软件提供。

## 应用信息与图标

`apps/website/manifest.json` 是安装名称、短名称、英文介绍、主题色、启动背景色与图标列表的来源。已确认名称和短名称均为 Simple Copy，图标补底及启动背景为 `#fdfcfe`。页面仍通过现有设置同步语言与明暗模式，深色主题为 `#1d1721`。启动背景保持浅色，运行中的浏览器主题色随页面设置变化。

图标来自 `packages/brand/assets/logo.svg`，保留透明鹦鹉图案与原有 favicon。运行以下命令可重复生成四张 PNG；项目已声明自己的 sharp 开发依赖，不依赖个人 Skill 目录：

```powershell
pnpm generate:pwa-icons
```

| 文件（位于 apps/website/public/icons） | 用途 |
| --- | --- |
| pwa-192x192.png、pwa-512x512.png | 桌面 any，连续圆角轮廓外透明，主体补不透明背景 |
| pwa-maskable-512x512.png | Android maskable，不透明方图，完整图案位于中心安全圆内 |
| apple-touch-icon.png | iOS 180px 不透明方图，系统负责裁切 |

`scripts/pwa/generate-icons.mjs` 和 `scripts/pwa/lib/` 来自 adapt-pwa 1.0.1；`lib/ios-mask.mjs` 是本项目唯一的连续圆角路径来源。更换品牌资源或补底颜色时，应同时更新生成命令、检查预览并重新提交生成的 PNG。

## 启动与部署路径

`apps/website/pwa.ts` 为首页和 demo.html 生成 Manifest、Apple 主屏幕图标和独立启动声明。生产构建从页面、脚本、样式、字体及图标内容生成带版本摘要的 `sw.js`。`src/pwa.ts` 只在生产、安全上下文且支持 Worker 时，从网站主页面注册；iframe 不创建第二套注册。

默认部署在 `/`，也支持已知的子目录：

```powershell
pnpm --filter @simple-copy/website build --base=/copy/
```

将完整 dist 放在对应目录，`/copy/` 应正常提供首页。Manifest 的 `id` 由构建显式设为 `/` 或 `/copy/`；`start_url` 和 `scope` 相对清单目录解析。相对 `id` 按 origin 解析，因此不能用 `./` 代替部署目录。Worker、图标、canonical、页面和 iframe 均跟随同一 base。PWA 构建要求固定的同源绝对路径，不接受 `--base=./` 或跨域 CDN base。已发布后保持身份与路径稳定，不通过改 id 解决安装缓存问题。

显式配置的 `VITE_DOWNLOAD_URL` 保持原地址语义；子目录部署时需指向真实可访问的安装包。`package:website` 默认继续生成根路径部署包。

生产需要 HTTPS。静态托管应保留真实 404，不能把缺失的 sw.js、PNG、下载或 API 请求改写成首页。建议响应策略：

| 资源 | MIME / 缓存 |
| --- | --- |
| 首页、index.html、demo.html | text/html，Cache-Control: no-cache |
| sw.js | text/javascript 或 application/javascript，Cache-Control: no-cache |
| manifest.webmanifest | application/manifest+json，Cache-Control: no-cache |
| icons/*.png | image/png，Cache-Control: no-cache |
| assets/ 下的内容哈希文件 | 按类型提供 MIME，可使用 public, max-age=31536000, immutable |

安装入口使用浏览器原生能力。Chrome / Edge 可使用浏览器提供的安装入口；iOS 可通过 Safari 分享菜单添加到主屏幕，具体独立启动选项以系统版本为准。

## 离线、存储与更新

- 首次缓存完整成功后，首页、演示、共享设置、图片和所有随包字体可离线打开。示例记录的搜索、置顶、删除等仍为当前页面内存状态；PWA 不增加历史持久化。
- 浏览器设置继续使用原来的 localStorage 所有者。存储不可用时沿用本次访问内设置，不创建 PWA 私有业务状态。
- 页面与带内容哈希的资源按同一构建版本缓存。只拦截已知资源的同源 GET；带查询参数、Range、下载、API、POST 及外部请求保持原网络行为。未知路径没有 app-shell 回退。
- Manifest 与安装图标独立执行网络优先，并重新验证 HTTP 缓存。仅网络异常才读取上次成功缓存；真实 HTTP 错误和错误 MIME 继续返回服务器响应，缓存写入失败也不丢弃有效网络响应。
- 不强制 skipWaiting、不自动刷新或接管已有页面。新版等待所有旧标签页及应用窗口关闭后激活，随后只清理当前 scope 拥有的旧页面缓存。
- 注册失败、不支持 Worker、首次页面尚未受控或缓存被清理时，网站仍按普通网页联网运行。缓存不是备份；首次访问未成功缓存或存储被系统清理后，需要联网重新打开。离线状态下安装包下载仍需恢复网络。

## 验证

```powershell
pnpm build
pnpm typecheck
pnpm test:pwa
pnpm exec playwright test tests/ui/website.spec.ts
```

Worker 测试覆盖缓存边界、部分安装失败、HTTP 错误、存储拒绝与配额失败。浏览器测试使用构建产物和隔离的本地 HTTP 服务，覆盖离线页面及共享设置、旧 Worker 控制页面时的元信息更新与回退、多窗口等待、注册失败，以及子目录部署的浏览器实际 Manifest 解析。

这些检查证明源码、产物和自动化浏览器行为，不代替线上响应或真机安装验收。发布后仍需检查生产 HTTPS、MIME、缓存头与实际受控页面，再分别验证 Windows 桌面/任务栏图标、Android 遮罩与系统返回、iOS 主屏幕独立启动、横竖屏安全区及软键盘。

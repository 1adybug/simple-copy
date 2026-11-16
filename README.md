# Simple Copy

使用 Tauri 2、Rust、React、TypeScript、Tailwind CSS 4 和 shadcn/ui 构建的本机剪贴板应用。界面参考 Windows 剪贴板面板，当前交付和验收以 Windows 为目标。

## Monorepo 结构

使用 pnpm workspace 管理应用和共享品牌资源，所有 JavaScript 依赖共用根目录的 pnpm-lock.yaml。

~~~text
apps/
  desktop/              # Tauri 桌面端，包含 React 前端和 src-tauri Rust 工程
  website/              # 多语言宣传网站，可独立构建、静态部署
packages/
  brand/                # 共享产品名称、SVG 标识、基础配色和字体
  i18n/                 # 桌面端、原生服务与网站共用的语言匹配和翻译字典
  ui/                   # 共享历史面板、设置表单、窗口外壳、控件、图标、类型和产品样式
scripts/
  package-website.mjs    # 将真实 Windows 安装包与宣传网站一起打包
tsconfig.base.json      # 共享 TypeScript 严格检查配置
~~~

桌面原生接口保留在 desktop 内。桌面端与网站演示共同使用 @simple-copy/ui 的历史面板和样式，网站通过独立的 demo.html 隔离宣传页样式，只接入示例数据，不依赖 Tauri。共享包以 workspace:* 引用，直接消费源码和 CSS，无需独立编译。

设置表单也由共享包的 @simple-copy/ui/settings-panel 提供，包含字段校验、保留方式与条数确认、快捷键录入界面和保存反馈。桌面端 SettingsView 只负责接入原生快捷键录入与关闭前等待保存，持久设置仍由 native.ts 的自动保存队列和 Rust 管理。

## 使用

- 默认按 Win + V 打开或收起面板，也可以点击托盘图标。
- 支持英语、简体中文、繁体中文、日语、韩语、德语、法语、西班牙语、葡萄牙语和俄语。设置中的「语言」默认跟随系统，也可手动选择；保存后立即同步主窗口、设置窗口及托盘文字。跟随系统时按 Windows 首选界面语言顺序匹配，修改系统显示语言后重启应用生效。网站和安装器分别跟随浏览器与系统语言；无匹配时使用英文。中文会区分简繁书写体系及地区，语言包随应用离线提供。
- 点击历史项会写入系统剪贴板，再回到原输入窗口发送粘贴键。原窗口失效、焦点变化或系统限制按键注入时，面板会显示手动粘贴提示。
- 每张卡片右侧的图钉、复制和删除按钮依次与三行文字对齐；复制和删除在悬停或键盘聚焦卡片时显示。最近置顶的内容排第一，「清除未置顶」保留置顶内容。
- 方向键浏览记录，Enter 选择，Esc 收起。
- 设置中可以选择记录纯文本、链接、HTML/RTF、图片和文件引用。文件记录保存原文件引用，重放按复制处理。
- 明暗模式支持跟随系统、浅色和深色，默认跟随系统；设置自动保存并同步到历史面板与设置窗口。无论选择哪种明暗模式，Windows 强调色和透明效果始终实时跟随系统：强调色用于选中状态、图钉和控件，并生成同色系背景；开启透明效果时使用原生亚克力背景，关闭时恢复不透明背景。高对比度模式使用系统颜色并关闭透明，减少动态效果的系统偏好也会生效。强调色会按当前明暗模式调整对比度，保证文字和控件清晰；系统外观接口或背景材质不可用时保留可用的不透明界面。其他平台继续使用原有品牌配色。

## 历史与常驻恢复

历史保留提供三种方式，默认只保留置顶。选择「仅本次运行」会清除磁盘历史，选择「只保留置顶」会从磁盘移除普通历史，本次运行的记录可继续使用。

持久记录使用 AES-256-GCM 加密后写入 SQLite，随机生成的主密钥存入 Windows 凭据管理器。密钥库暂不可用时，新增记录保留在本次运行中。设置和置顶标记也保存在本机。

常驻恢复默认关闭，启用后的默认间隔为 5 秒，可设为 1–3600 秒。每次外部复制或选择其他历史内容重新计时，到期使用当时第一条置顶内容。修改间隔会对正在等待的任务重新计时。关闭功能、退出软件或移除最后一条置顶内容会取消等待。

Windows 写回在剪贴板锁内核对系统版本。新复制发生在计时到期附近时，较新的版本优先。恢复写回有独立的写入标记和已确认版本号。

普通历史默认最多保存 20 条，已有的明确设置保留原值。可在设置中调整，0 表示不限制条数；置顶内容不计入条数上限。减少上限需确认，超出的较早记录会立即从历史和磁盘中移除。单条数据上限为 32 MiB，128 MiB 的历史预算仍优先淘汰普通记录，置顶项由用户管理。源应用标记为私密或临时的剪贴板内容会跳过收录。

相同内容只保留一条记录：按完整文字、图片像素或文件引用判断，不受附带的 HTML/RTF 等格式影响。再次复制会更新原记录的内容格式和最近排序，保留置顶状态与置顶顺序，并照常重新计算常驻恢复时间。文字中的空格、大小写和换行仍参与比较。

默认数据目录为 %LOCALAPPDATA%\io.simplecopy.clipboard，数据库文件为 history.sqlite。SIMPLE_COPY_DATA_DIR 环境变量可指定隔离的数据目录，用于测试。

## 开发与构建

需要 Node.js 24、pnpm 11、Rust stable、MSVC C++ Build Tools 和 WebView2 Runtime。

~~~powershell
pnpm install --frozen-lockfile
pnpm dev:desktop
~~~

根目录的 pnpm tauri dev、pnpm tauri build 仍可使用，命令会转发给 desktop。Tauri 的前置命令在 desktop 内执行，因此只启动或构建桌面前端。

~~~powershell
pnpm build
pnpm check:rust
pnpm test
pnpm exec playwright install chromium
pnpm test:ui
pnpm build:installer
~~~

pnpm typecheck 检查所有工作区，pnpm build 构建两个应用的前端；原生程序需另外执行 pnpm build:installer。也可以分别运行 pnpm build:desktop 和 pnpm build:website。

安装包输出到 apps/desktop/src-tauri/target/release/bundle/nsis，独立程序输出到 apps/desktop/src-tauri/target/release/simple-copy.exe。当前构建使用 NSIS 的当前用户安装方式，安装包签名需要发布方提供证书。

`pnpm test:ui` 检查已构建的两个前端，运行前先执行 `pnpm build`。浏览器测试使用隔离的 Tauri IPC 和剪贴板模拟，覆盖长图片历史的按需加载与资源释放、设置选择器、各明暗模式下的系统强调色与透明状态同步、外观事件与首次查询的竞争、极端强调色的对比度、网站键盘与触屏操作，以及自动化无障碍检查；不会操作系统剪贴板。测试产物位于 `.artifacts/ui-tests`，这类检查不代替 Windows 原生交互验收。

## 宣传网站

~~~powershell
pnpm dev                 # 等同 pnpm dev:website，http://127.0.0.1:5173
pnpm build:website      # 输出 apps/website/dist
pnpm preview:website    # http://127.0.0.1:4173
~~~

网站保留产品演示、简短使用步骤、格式与核心功能介绍和获取入口，支持手机布局、键盘、减少动态效果与高对比度模式。演示复用实际软件的标题栏、搜索、卡片和操作按钮；设置与收起按钮可点击，但不执行操作，重置演示放在软件面板外。粘贴、置顶、删除与清除只操作示例内容，不读取系统剪贴板；「复制」仅在点击时写入所选示例文字，并在失败时提示。构建指南的「复制命令」按钮仅在点击时复制显示的命令。

有正式下载地址时，将 apps/website/.env.example 复制为 apps/website/.env.local，设置 VITE_DOWNLOAD_URL 为 HTTPS 下载地址或网站根路径下的安装包地址；可选设置 VITE_SITE_URL 为正式 HTTPS 站点地址，用于 canonical 和 Open Graph URL。环境变量在构建时注入，修改后需重新构建。没有下载地址时，页面显示源码构建指南。

如果需要一个自带真实安装包、可直接部署的静态网站：

~~~powershell
pnpm build:installer
pnpm package:website
pnpm preview:website
~~~

package:website 从当前版本的 NSIS 输出中选择安装包，将下载地址注入网站构建，复制安装包及 SHA-256 校验文件到 apps/website/dist/downloads。存在多个架构的安装包时，需显式指定：pnpm package:website "安装包完整路径"。

将完整的 apps/website/dist 部署到任意支持静态文件的托管服务即可；无需 Node.js 服务端。宣传网站不会自动发布到外部托管。普通 pnpm build 或 pnpm build:website 会重新生成不含安装包的 dist，发布带下载的网站时应最后运行 pnpm package:website。

共享 Logo 位于 packages/brand/assets/logo.svg，是用平滑曲线、椭圆和圆形重建的无描边卡通鹦鹉，背景透明，不包含嵌入位图。需要调整或重新生成几何时，使用已安装的 image-to-geometric-svg Skill 工具目录：

~~~powershell
python scripts/generate-brand-logo.py --skill-dir "<image-to-geometric-svg skill directory>" --output packages/brand/assets/logo.svg --overwrite
~~~

生成器的 --flat 选项可输出纯色轮廓供检查。普通开发与构建直接使用已提交的 SVG，不依赖 Skill 的安装位置。

修改品牌标识后，在桌面应用中重新生成原生图标：

~~~powershell
pnpm --filter @simple-copy/desktop tauri icon ../../packages/brand/assets/logo.svg --output src-tauri/icons
~~~

桌面构建会跟踪 PNG、ICO 和 ICNS 图标资源的变化，Windows 安装器与卸载器使用同一份 ICO。重新生成图标后执行 pnpm build:installer，再执行 pnpm package:website，让程序和网站下载包一起更新。

## Windows 交互测试

源码提供单独的交互测试，需在可交互的 Windows 桌面上显式运行。

~~~powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib interactive_clipboard_roundtrip_hotkey_and_paste -- --ignored --nocapture
~~~

此测试临时使用系统剪贴板和一个原生编辑窗口，检查文字、HTML、RTF、PNG、文件及文件夹引用、剪贴板版本竞争、Win + V 拦截、原窗口粘贴和已关闭窗口。结束时恢复测试前能够读取的剪贴板内容。

非交互测试覆盖格式过滤、去重、置顶顺序、保留方式切换、恢复计时和加密记录校验。桌面检查已验证实际记事本中的中文粘贴和置顶重启保留。动态设置窗口和常驻恢复的完整桌面回归仍需补充。

## 平台进度

Windows 原生集成和安装包为本轮交付目标。macOS 与 Linux X11 具有基础剪贴板读写适配，原窗口自动粘贴和 Wayland 集成留待后续完成。

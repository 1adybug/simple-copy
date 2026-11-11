# Simple Copy

使用 Tauri 2、Rust、React、TypeScript、Tailwind CSS 4 和 shadcn/ui 构建的本机剪贴板应用。界面参考 Windows 剪贴板面板，当前交付和验收以 Windows 为目标。

## 使用

- 默认按 Win + V 打开或收起面板，也可以点击托盘图标。
- 点击历史项会写入系统剪贴板，再回到原输入窗口发送粘贴键。原窗口失效、焦点变化或系统限制按键注入时，面板会显示手动粘贴提示。
- 图钉设置置顶，最近置顶的内容排第一。更多菜单提供复制和删除。「清除未置顶」保留置顶内容。
- 方向键浏览记录，Enter 选择，Esc 收起。
- 设置中可以选择记录纯文本、链接、HTML/RTF、图片和文件引用。文件记录保存原文件引用，重放按复制处理。

## 历史与常驻恢复

历史保留提供三种方式，默认只保留置顶。选择「仅本次运行」会清除磁盘历史，选择「只保留置顶」会从磁盘移除普通历史，本次运行的记录可继续使用。

持久记录使用 AES-256-GCM 加密后写入 SQLite，随机生成的主密钥存入 Windows 凭据管理器。密钥库暂不可用时，新增记录保留在本次运行中。设置和置顶标记也保存在本机。

常驻恢复默认关闭，启用后的默认间隔为 5 秒，可设为 1–3600 秒。每次外部复制或选择其他历史内容重新计时，到期使用当时第一条置顶内容。修改间隔会对正在等待的任务重新计时。关闭功能、退出软件或移除最后一条置顶内容会取消等待。

Windows 写回在剪贴板锁内核对系统版本。新复制发生在计时到期附近时，较新的版本优先。恢复写回有独立的写入标记和已确认版本号。

普通历史最多 100 条，单条数据上限为 32 MiB。128 MiB 的历史预算优先淘汰普通记录，置顶项由用户管理。源应用标记为私密或临时的剪贴板内容会跳过收录。

默认数据目录为 %LOCALAPPDATA%\io.simplecopy.clipboard，数据库文件为 history.sqlite。SIMPLE_COPY_DATA_DIR 环境变量可指定隔离的数据目录，用于测试。

## 开发与构建

需要 Node.js 24、pnpm 11、Rust stable、MSVC C++ Build Tools 和 WebView2 Runtime。

~~~powershell
pnpm install --frozen-lockfile
pnpm tauri dev
~~~

~~~powershell
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri build --bundles nsis
~~~

安装包输出到 src-tauri/target/release/bundle/nsis，独立程序输出到 src-tauri/target/release/simple-copy.exe。当前构建使用 NSIS 的当前用户安装方式，安装包签名需要发布方提供证书。

## Windows 交互测试

源码提供单独的交互测试，需在可交互的 Windows 桌面上显式运行。

~~~powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib interactive_clipboard_roundtrip_hotkey_and_paste -- --ignored --nocapture
~~~

此测试临时使用系统剪贴板和一个原生编辑窗口，检查文字、HTML、RTF、PNG、文件及文件夹引用、剪贴板版本竞争、Win + V 拦截、原窗口粘贴和已关闭窗口。结束时恢复测试前能够读取的剪贴板内容。

非交互测试覆盖格式过滤、去重、置顶顺序、保留方式切换、恢复计时和加密记录校验。桌面检查已验证实际记事本中的中文粘贴和置顶重启保留。动态设置窗口和常驻恢复的完整桌面回归仍需补充。

## 平台进度

Windows 原生集成和安装包为本轮交付目标。macOS 与 Linux X11 具有基础剪贴板读写适配，原窗口自动粘贴和 Wayland 集成留待后续完成。

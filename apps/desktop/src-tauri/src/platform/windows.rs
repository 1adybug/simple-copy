use std::{
    cell::Cell,
    mem::{size_of, zeroed},
    ptr::{null, null_mut},
    sync::{
        OnceLock,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

use clipboard_rs::ClipboardContext;
use tauri::AppHandle;
use windows_sys::Win32::{
    Foundation::{GlobalFree, HWND, LPARAM, LRESULT, POINT, WPARAM},
    Graphics::Gdi::ClientToScreen,
    System::{
        DataExchange::{
            AddClipboardFormatListener, CloseClipboard, EmptyClipboard, GetClipboardData,
            GetClipboardSequenceNumber, OpenClipboard, RegisterClipboardFormatW,
            RemoveClipboardFormatListener, SetClipboardData,
        },
        LibraryLoader::GetModuleHandleW,
        Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock},
    },
    UI::{
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
            SendInput, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
        },
        WindowsAndMessaging::*,
    },
};

use super::{
    Capabilities, Capture, ClipboardBackend, ORIGIN_FORMAT, Wake, Written, read_payload,
    validate_files,
};
use crate::model::{Formats, Payload, WriteId, decode_image};

const WM_SHOW_HISTORY: u32 = WM_APP + 1;
const INJECTED_TAG: usize = 0x53434F50;
static WIN_V_ENABLED: AtomicBool = AtomicBool::new(false);
static MESSAGE_WINDOW: AtomicUsize = AtomicUsize::new(0);
static HOOK_READY: AtomicBool = AtomicBool::new(false);
static CALLBACKS: OnceLock<(Wake, Wake)> = OnceLock::new();
thread_local! {
    static V_CONSUMED: Cell<bool> = const { Cell::new(false) };
}

#[derive(Clone, Debug)]
pub struct Target {
    window: usize,
    process: u32,
    focus: usize,
    pub anchor: Option<(i32, i32)>,
}

pub struct Monitor {
    window: usize,
    join: Option<thread::JoinHandle<()>>,
}

impl Drop for Monitor {
    fn drop(&mut self) {
        // The message-only window belongs to the dedicated message thread.
        unsafe {
            PostMessageW(self.window as HWND, WM_CLOSE, 0, 0);
        }
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

pub fn start_monitor(changed: Wake, shortcut: Wake) -> Result<Monitor, String> {
    CALLBACKS
        .set((changed, shortcut))
        .map_err(|_| crate::i18n::t("native.monitorStarted").to_string())?;
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let join = thread::Builder::new()
        .name("clipboard-windows-events".into())
        .spawn(move || {
            // This thread owns the window, hook, and Win32 message loop.
            unsafe {
                let name = wide("SimpleCopyClipboardEvents");
                let instance = GetModuleHandleW(null());
                let class = WNDCLASSW {
                    lpfnWndProc: Some(window_proc),
                    hInstance: instance,
                    lpszClassName: name.as_ptr(),
                    ..zeroed()
                };
                if RegisterClassW(&class) == 0 {
                    let _ = ready_tx.send(Err(crate::i18n::t("native.monitorWindow").to_string()));
                    return;
                }
                let window = CreateWindowExW(
                    0,
                    name.as_ptr(),
                    name.as_ptr(),
                    0,
                    0,
                    0,
                    0,
                    0,
                    HWND_MESSAGE,
                    null_mut(),
                    instance,
                    null(),
                );
                if window.is_null() || AddClipboardFormatListener(window) == 0 {
                    if !window.is_null() {
                        DestroyWindow(window);
                    }
                    let _ = ready_tx.send(Err(crate::i18n::t("native.monitorStart").to_string()));
                    return;
                }
                MESSAGE_WINDOW.store(window as usize, Ordering::Release);
                let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), instance, 0);
                HOOK_READY.store(!hook.is_null(), Ordering::Release);
                let _ = ready_tx.send(Ok(window as usize));
                let mut message = zeroed();
                while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
                    TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
                WIN_V_ENABLED.store(false, Ordering::Release);
                HOOK_READY.store(false, Ordering::Release);
                MESSAGE_WINDOW.store(0, Ordering::Release);
                if !hook.is_null() {
                    UnhookWindowsHookEx(hook);
                }
                RemoveClipboardFormatListener(window);
                UnregisterClassW(name.as_ptr(), instance);
            }
        })
        .map_err(|error| error.to_string())?;
    let window = ready_rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| crate::i18n::t("native.monitorTimeout").to_string())??;
    Ok(Monitor {
        window,
        join: Some(join),
    })
}

pub fn enable_win_v(enabled: bool) -> Result<(), String> {
    if enabled && !HOOK_READY.load(Ordering::Acquire) {
        return Err(crate::i18n::t("native.winV").into());
    }
    WIN_V_ENABLED.store(enabled, Ordering::Release);
    Ok(())
}

unsafe extern "system" fn window_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_CLIPBOARDUPDATE => {
            if let Some((changed, _)) = CALLBACKS.get() {
                changed();
            }
            0
        }
        WM_SHOW_HISTORY => {
            if let Some((_, shortcut)) = CALLBACKS.get() {
                shortcut();
            }
            0
        }
        WM_CLOSE => {
            unsafe {
                DestroyWindow(window);
            }
            0
        }
        WM_DESTROY => {
            unsafe {
                PostQuitMessage(0);
            }
            0
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

unsafe extern "system" fn keyboard_proc(code: i32, message: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        // Windows owns this pointer for the duration of the hook callback.
        let key = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
        if key.vkCode == u32::from(b'V') && key.dwExtraInfo != INJECTED_TAG {
            let released = matches!(message as u32, WM_KEYUP | WM_SYSKEYUP);
            if released && V_CONSUMED.with(|consumed| consumed.replace(false)) {
                return 1;
            }
            let exact_chord = WIN_V_ENABLED.load(Ordering::Acquire)
                && (pressed(VK_LWIN) || pressed(VK_RWIN))
                && !pressed(VK_CONTROL)
                && !pressed(VK_MENU)
                && !pressed(VK_SHIFT);
            if !released && exact_chord {
                if !V_CONSUMED.with(|consumed| consumed.replace(true)) {
                    // A dummy key cancels the Win key's standalone Start-menu action.
                    // It carries our tag so it cannot re-enter a registered shortcut.
                    let dummy = [key_input(0xff, false), key_input(0xff, true)];
                    unsafe {
                        SendInput(
                            dummy.len() as u32,
                            dummy.as_ptr(),
                            size_of::<INPUT>() as i32,
                        );
                    }
                    let window = MESSAGE_WINDOW.load(Ordering::Acquire) as HWND;
                    unsafe {
                        PostMessageW(window, WM_SHOW_HISTORY, 0, 0);
                    }
                }
                return 1;
            }
        }
    }
    unsafe { CallNextHookEx(null_mut(), code, message, lparam) }
}

pub fn capture_target() -> Option<Target> {
    // Foreground handles and caret geometry are snapshots used only for this popup session.
    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return None;
        }
        let mut process = 0;
        let thread = GetWindowThreadProcessId(window, &mut process);
        if process == std::process::id() {
            return None;
        }
        let mut info = GUITHREADINFO {
            cbSize: size_of::<GUITHREADINFO>() as u32,
            ..zeroed()
        };
        let mut point = POINT { x: 0, y: 0 };
        let has_info = GetGUIThreadInfo(thread, &mut info) != 0;
        let anchor =
            if has_info && !info.hwndCaret.is_null() && info.rcCaret.bottom > info.rcCaret.top {
                point.x = info.rcCaret.left;
                point.y = info.rcCaret.bottom;
                (ClientToScreen(info.hwndCaret, &mut point) != 0).then_some((point.x, point.y))
            } else if GetCursorPos(&mut point) != 0 {
                Some((point.x, point.y))
            } else {
                None
            };
        Some(Target {
            window: window as usize,
            process,
            focus: info.hwndFocus as usize,
            anchor,
        })
    }
}

pub struct Native {
    ctx: ClipboardContext,
}

impl Native {
    pub fn new(_app: AppHandle) -> Result<Self, String> {
        Ok(Self {
            ctx: ClipboardContext::new().map_err(|error| error.to_string())?,
        })
    }
}

impl ClipboardBackend for Native {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            platform: "windows",
            background: MESSAGE_WINDOW.load(Ordering::Acquire) != 0,
            automatic_paste: true,
            restore_available: true,
            can_authorize: false,
            message: None,
        }
    }

    fn revision(&self) -> Result<u64, String> {
        Ok(unsafe { GetClipboardSequenceNumber() }.into())
    }

    fn read(&self, formats: &Formats) -> Result<Capture, String> {
        let before = self.revision()?;
        let (payload, origin) = read_payload(&self.ctx, formats)?;
        let revision = self.revision()?;
        if before != revision {
            return Err(crate::i18n::t("native.clipboardReread").into());
        }
        Ok(Capture {
            revision,
            payload,
            origin,
        })
    }

    fn write(
        &self,
        payload: &Payload,
        expected: Option<u64>,
        origin: WriteId,
    ) -> Result<Written, String> {
        validate_files(payload)?;
        let prepared = prepare_formats(payload, origin)?;
        let mut blocks = Vec::with_capacity(prepared.len());
        for (format, bytes) in prepared {
            blocks.push((format, MemoryBlock::new(&bytes)?));
        }
        let clipboard = ClipboardLock::open()?;
        if expected.is_some_and(|revision| self.revision().ok() != Some(revision)) {
            return Ok(Written::Superseded);
        }
        if unsafe { EmptyClipboard() } == 0 {
            return Err(crate::i18n::t("native.clipboardWrite").into());
        }
        for (format, mut block) in blocks {
            if unsafe { SetClipboardData(format, block.0) }.is_null() {
                return Err(crate::i18n::t("native.clipboardFormats").into());
            }
            // SetClipboardData transfers ownership only after a successful call.
            block.0 = null_mut();
        }
        // Windows publishes the final sequence number when the write lock closes.
        drop(clipboard);
        let _verification = ClipboardLock::open()?;
        let marker = unsafe { GetClipboardData(format_id(ORIGIN_FORMAT)?) };
        if marker.is_null() || unsafe { GlobalSize(marker) } < origin.len() {
            return Ok(Written::Superseded);
        }
        let pointer = unsafe { GlobalLock(marker) };
        if pointer.is_null() {
            return Err(crate::i18n::t("native.clipboardVerify").into());
        }
        let matches =
            unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), origin.len()) == origin };
        unsafe {
            GlobalUnlock(marker);
        }
        if matches {
            Ok(Written::Applied(self.revision()?))
        } else {
            Ok(Written::Superseded)
        }
    }

    fn paste(&self, target: &Target, expected: u64) -> Result<bool, String> {
        let window = target.window as HWND;
        unsafe {
            let mut current_process = 0;
            if IsWindow(window) == 0
                || GetWindowThreadProcessId(window, &mut current_process) == 0
                || current_process != target.process
            {
                return Ok(false);
            }
            SetForegroundWindow(window);
        }
        let deadline = Instant::now() + Duration::from_millis(500);
        while Instant::now() < deadline {
            if self.revision()? != expected {
                return Err(crate::i18n::t("native.clipboardUpdated").into());
            }
            let modifiers_down = [VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN]
                .into_iter()
                .any(pressed);
            if unsafe { GetForegroundWindow() } == window && !modifiers_down {
                let mut info = GUITHREADINFO {
                    cbSize: size_of::<GUITHREADINFO>() as u32,
                    ..unsafe { zeroed() }
                };
                let thread = unsafe { GetWindowThreadProcessId(window, null_mut()) };
                let focus_restored = target.focus == 0
                    || (unsafe { GetGUIThreadInfo(thread, &mut info) } != 0
                        && info.hwndFocus as usize == target.focus);
                if focus_restored {
                    let keys = [
                        key_input(VK_CONTROL, false),
                        key_input(u16::from(b'V'), false),
                        key_input(u16::from(b'V'), true),
                        key_input(VK_CONTROL, true),
                    ];
                    let sent = unsafe {
                        SendInput(keys.len() as u32, keys.as_ptr(), size_of::<INPUT>() as i32)
                    };
                    return Ok(sent == keys.len() as u32);
                }
            }
            thread::sleep(Duration::from_millis(10));
        }
        Ok(false)
    }
}

struct ClipboardLock;

impl ClipboardLock {
    fn open() -> Result<Self, String> {
        let window = MESSAGE_WINDOW.load(Ordering::Acquire) as HWND;
        for _ in 0..12 {
            if unsafe { OpenClipboard(window) } != 0 {
                return Ok(Self);
            }
            thread::sleep(Duration::from_millis(10));
        }
        Err(crate::i18n::t("native.clipboardBusy").into())
    }
}

impl Drop for ClipboardLock {
    fn drop(&mut self) {
        unsafe {
            CloseClipboard();
        }
    }
}

struct MemoryBlock(*mut std::ffi::c_void);

impl MemoryBlock {
    fn new(bytes: &[u8]) -> Result<Self, String> {
        unsafe {
            let memory = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
            if memory.is_null() {
                return Err(crate::i18n::t("native.clipboardAllocate").into());
            }
            let block = Self(memory);
            let pointer = GlobalLock(memory);
            if pointer.is_null() {
                return Err(crate::i18n::t("native.clipboardAccess").into());
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.cast::<u8>(), bytes.len());
            GlobalUnlock(memory);
            Ok(block)
        }
    }
}

impl Drop for MemoryBlock {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GlobalFree(self.0);
            }
        }
    }
}

fn prepare_formats(payload: &Payload, origin: WriteId) -> Result<Vec<(u32, Vec<u8>)>, String> {
    let mut formats = Vec::new();
    if let Some(text) = &payload.text {
        formats.push((
            13,
            wide(text).into_iter().flat_map(u16::to_le_bytes).collect(),
        ));
    }
    if let Some(html) = &payload.html {
        formats.push((format_id("HTML Format")?, html_format(html)));
    }
    if let Some(rtf) = &payload.rtf {
        let mut bytes = rtf.clone();
        if bytes.last() != Some(&0) {
            bytes.push(0);
        }
        formats.push((format_id("Rich Text Format")?, bytes));
    }
    if let Some(png) = &payload.png {
        let image = decode_image(png)?.to_rgba8();
        let width = image.width() as i32;
        let height = image.height() as i32;
        let mut dib = Vec::with_capacity(124 + image.len());
        // BITMAPV5HEADER followed by top-down BGRA pixels with explicit alpha masks.
        for value in [124u32, width as u32, (-height) as u32] {
            dib.extend(value.to_le_bytes());
        }
        dib.extend(1u16.to_le_bytes());
        dib.extend(32u16.to_le_bytes());
        for value in [
            3u32,
            image.len() as u32,
            0,
            0,
            0,
            0,
            0x00ff0000,
            0x0000ff00,
            0x000000ff,
            0xff000000,
            0x73524742,
        ] {
            dib.extend(value.to_le_bytes());
        }
        dib.resize(124, 0);
        for pixel in image.pixels() {
            dib.extend([pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
        formats.push((17, dib));
        formats.push((format_id("PNG")?, png.clone()));
    }
    if !payload.files.is_empty() {
        let mut files = Vec::new();
        files.extend(20u32.to_le_bytes());
        files.extend([0u8; 12]);
        files.extend(1u32.to_le_bytes());
        for uri in &payload.files {
            let path = url::Url::parse(uri)
                .ok()
                .and_then(|url| url.to_file_path().ok())
                .ok_or_else(|| crate::i18n::t("native.fileReference").to_string())?;
            for unit in path.as_os_str().to_string_lossy().encode_utf16().chain([0]) {
                files.extend(unit.to_le_bytes());
            }
        }
        files.extend(0u16.to_le_bytes());
        formats.push((15, files));
        formats.push((
            format_id("Preferred DropEffect")?,
            1u32.to_le_bytes().to_vec(),
        ));
    }
    if formats.is_empty() {
        return Err(crate::i18n::t("native.emptyRecord").into());
    }
    formats.insert(0, (format_id(ORIGIN_FORMAT)?, origin.to_vec()));
    Ok(formats)
}

fn format_id(name: &str) -> Result<u32, String> {
    let id = unsafe { RegisterClipboardFormatW(wide(name).as_ptr()) };
    if id == 0 {
        Err(crate::i18n::t("native.clipboardRegister").into())
    } else {
        Ok(id)
    }
}

fn html_format(fragment: &str) -> Vec<u8> {
    let prefix = "<html><body><!--StartFragment-->";
    let suffix = "<!--EndFragment--></body></html>";
    let header = |start_html: usize,
                  end_html: usize,
                  start_fragment: usize,
                  end_fragment: usize| {
        format!(
            "Version:0.9\r\nStartHTML:{start_html:010}\r\nEndHTML:{end_html:010}\r\nStartFragment:{start_fragment:010}\r\nEndFragment:{end_fragment:010}\r\n"
        )
    };
    let start_html = header(0, 0, 0, 0).len();
    let start_fragment = start_html + prefix.len();
    let end_fragment = start_fragment + fragment.len();
    let end_html = end_fragment + suffix.len();
    format!(
        "{}{prefix}{fragment}{suffix}\0",
        header(start_html, end_html, start_fragment, end_fragment)
    )
    .into_bytes()
}

fn pressed(key: u16) -> bool {
    unsafe { GetAsyncKeyState(i32::from(key)) < 0 }
}

fn key_input(key: u16, released: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: if released { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: INJECTED_TAG,
            },
        },
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain([0]).collect()
}

#[cfg(test)]
mod tests {
    use clipboard_rs::Clipboard;
    use std::sync::{Arc, atomic::AtomicU64};

    use super::*;

    #[test]
    fn html_offsets_count_utf8_bytes_and_image_layout_is_valid() {
        let data = html_format("<b>中文</b>");
        let as_text = String::from_utf8(data.clone()).unwrap();
        for name in ["StartHTML", "EndHTML", "StartFragment", "EndFragment"] {
            let value: usize = as_text
                .lines()
                .find_map(|line| line.strip_prefix(&format!("{name}:")))
                .unwrap()
                .parse()
                .unwrap();
            assert!(value <= data.len());
        }
        let fragment_start: usize = as_text
            .lines()
            .find_map(|line| line.strip_prefix("StartFragment:"))
            .unwrap()
            .parse()
            .unwrap();
        let fragment_end: usize = as_text
            .lines()
            .find_map(|line| line.strip_prefix("EndFragment:"))
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(
            &data[fragment_start..fragment_end],
            "<b>中文</b>".as_bytes()
        );
    }

    #[test]
    #[ignore = "Uses the interactive Windows clipboard and a temporary native editor"]
    fn interactive_clipboard_roundtrip_hotkey_and_paste() {
        let notifications = Arc::new(AtomicU64::new(0));
        let seen = notifications.clone();
        let (shortcut_tx, shortcut_rx) = mpsc::channel();
        let monitor = start_monitor(
            Arc::new(move || {
                seen.fetch_add(1, Ordering::Relaxed);
            }),
            Arc::new(move || {
                let _ = shortcut_tx.send(());
            }),
        )
        .unwrap();
        let ctx = ClipboardContext::new().unwrap();
        let original = read_payload(&ctx, &Formats::default()).unwrap().0;
        struct Backup(Payload);
        impl Drop for Backup {
            fn drop(&mut self) {
                let native = Native {
                    ctx: ClipboardContext::new().unwrap(),
                };
                if self.0.size() > 0 {
                    let _ = native.write(&self.0, None, [0; 16]);
                } else if let Ok(_lock) = ClipboardLock::open() {
                    unsafe {
                        EmptyClipboard();
                    }
                }
            }
        }
        let _backup = Backup(original);
        let native = Native { ctx };
        let image = image::DynamicImage::new_rgba8(12, 9);
        let payload = Payload {
            text: Some("Simple Copy — 中文剪贴板测试".into()),
            html: Some("<b>中文剪贴板测试</b>".into()),
            rtf: Some(b"{\\rtf1\\ansi Simple Copy}".to_vec()),
            png: Some(crate::model::png_bytes(&image).unwrap()),
            ..Payload::default()
        };
        let Written::Applied(revision) = native.write(&payload, None, [3; 16]).unwrap() else {
            panic!("write");
        };
        let captured = native.read(&Formats::default()).unwrap();
        assert_eq!(captured.revision, revision);
        assert_eq!(captured.payload.text, payload.text);
        assert!(captured.payload.html.unwrap().contains("中文剪贴板测试"));
        let rtf = captured.payload.rtf.as_ref().unwrap();
        assert!(rtf.starts_with(payload.rtf.as_ref().unwrap()));
        assert_eq!(
            decode_image(captured.payload.png.as_ref().unwrap())
                .unwrap()
                .width(),
            12
        );
        assert_eq!(captured.origin, Some([3; 16]));

        native
            .ctx
            .set_text("newer external content".into())
            .unwrap();
        assert!(matches!(
            native.write(&payload, Some(revision), [4; 16]).unwrap(),
            Written::Superseded
        ));
        assert_eq!(native.ctx.get_text().unwrap(), "newer external content");

        let fixture =
            std::env::temp_dir().join(format!("simple-copy-native-test-{}", std::process::id()));
        std::fs::create_dir_all(&fixture).unwrap();
        let path = fixture.join("中文 file.txt");
        std::fs::write(&path, "test").unwrap();
        let files = Payload {
            files: vec![
                url::Url::from_file_path(&path).unwrap().into(),
                url::Url::from_file_path(&fixture).unwrap().into(),
            ],
            ..Payload::default()
        };
        native.write(&files, None, [5; 16]).unwrap();
        assert_eq!(
            native.read(&Formats::default()).unwrap().payload.files,
            files.files
        );

        let (window_tx, window_rx) = mpsc::channel();
        let editor_thread = thread::spawn(move || unsafe {
            let class_name = wide("SimpleCopyNativeTestEditor");
            let instance = GetModuleHandleW(null());
            let class = WNDCLASSW {
                lpfnWndProc: Some(editor_proc),
                hInstance: instance,
                lpszClassName: class_name.as_ptr(),
                ..zeroed()
            };
            assert_ne!(RegisterClassW(&class), 0);
            let window = CreateWindowExW(
                0,
                class_name.as_ptr(),
                wide("Simple Copy test editor").as_ptr(),
                WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                250,
                250,
                500,
                220,
                null_mut(),
                null_mut(),
                instance,
                null(),
            );
            assert!(!window.is_null());
            let edit = CreateWindowExW(
                0,
                wide("EDIT").as_ptr(),
                wide("").as_ptr(),
                WS_CHILD | WS_VISIBLE | ES_MULTILINE as u32 | ES_AUTOVSCROLL as u32,
                10,
                10,
                460,
                150,
                window,
                null_mut(),
                instance,
                null(),
            );
            assert!(!edit.is_null());
            SetWindowLongPtrW(window, GWLP_USERDATA, edit as isize);
            SetForegroundWindow(window);
            windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus(edit);
            window_tx.send((window as usize, edit as usize)).unwrap();
            let mut message = zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            UnregisterClassW(class_name.as_ptr(), instance);
        });
        let (window, edit) = window_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        enable_win_v(true).unwrap();
        let mut hotkey = [
            key_input(VK_LWIN, false),
            key_input(u16::from(b'V'), false),
            key_input(u16::from(b'V'), true),
            key_input(VK_LWIN, true),
        ];
        for input in &mut hotkey {
            input.Anonymous.ki.dwExtraInfo = 0;
        }
        assert_eq!(
            unsafe {
                SendInput(
                    hotkey.len() as u32,
                    hotkey.as_ptr(),
                    size_of::<INPUT>() as i32,
                )
            },
            4
        );
        shortcut_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("Win+V intercepted");
        enable_win_v(false).unwrap();
        let paste_text = "自动粘贴验证 passed";
        let Written::Applied(revision) = native
            .write(
                &Payload {
                    text: Some(paste_text.into()),
                    ..Payload::default()
                },
                None,
                [6; 16],
            )
            .unwrap()
        else {
            panic!("write");
        };
        assert!(
            native
                .paste(
                    &Target {
                        window,
                        process: std::process::id(),
                        focus: edit,
                        anchor: None
                    },
                    revision
                )
                .unwrap()
        );
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut text = String::new();
        while Instant::now() < deadline {
            let mut buffer = vec![0u16; 200];
            let length =
                unsafe { GetWindowTextW(edit as HWND, buffer.as_mut_ptr(), buffer.len() as i32) };
            text = String::from_utf16_lossy(&buffer[..length as usize]);
            if text == paste_text {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        unsafe {
            PostMessageW(window as HWND, WM_CLOSE, 0, 0);
        }
        editor_thread.join().unwrap();
        assert_eq!(text, paste_text);
        assert!(
            !native
                .paste(
                    &Target {
                        window,
                        process: std::process::id(),
                        focus: edit,
                        anchor: None
                    },
                    revision
                )
                .unwrap()
        );
        assert!(notifications.load(Ordering::Relaxed) > 0);
        drop(_backup);
        drop(monitor);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(fixture).unwrap();
    }

    unsafe extern "system" fn editor_proc(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_SETFOCUS {
            let edit = unsafe { GetWindowLongPtrW(window, GWLP_USERDATA) } as HWND;
            if !edit.is_null() {
                unsafe {
                    windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus(edit);
                }
            }
        }
        if message == WM_DESTROY {
            unsafe {
                PostQuitMessage(0);
            }
            return 0;
        }
        unsafe { DefWindowProcW(window, message, wparam, lparam) }
    }
}

use std::{mem::size_of_val, ptr};

use windows_sys::Win32::{
    Foundation::HWND,
    Graphics::{
        Dwm::{
            DWMSBT_NONE, DWMSBT_TRANSIENTWINDOW, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
            DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_USE_IMMERSIVE_DARK_MODE,
            DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DwmSetWindowAttribute,
        },
        Gdi::{CreateRectRgn, CreateRoundRectRgn, DeleteObject, GetWindowRgn, SetWindowRgn},
    },
};

pub(super) const FALLBACK_RADIUS: f64 = 8.;

fn attribute<T>(hwnd: HWND, key: i32, value: &T) -> bool {
    // All callers supply the documented Win32 scalar type for their attribute.
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            key as u32,
            value as *const _ as _,
            size_of_val(value) as u32,
        ) >= 0
    }
}

pub(super) fn native_corners(hwnd: HWND) -> bool {
    if !attribute(hwnd, DWMWA_BORDER_COLOR, &DWMWA_COLOR_NONE)
        || !attribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &DWMWCP_ROUND)
    {
        return false;
    }
    // An application window region opts out of DWM rounding. Remove a previous
    // fallback region before allowing the system to clip both WebView2 and acrylic.
    unsafe {
        let region = CreateRectRgn(0, 0, 0, 0);
        if region.is_null() {
            return false;
        }
        let has_region = GetWindowRgn(hwnd, region) != 0;
        DeleteObject(region);
        !has_region || SetWindowRgn(hwnd, ptr::null_mut(), 1) != 0
    }
}

pub(super) fn fallback_corners(hwnd: HWND, width: u32, height: u32, diameter: i32) -> bool {
    unsafe {
        let region = CreateRoundRectRgn(
            0,
            0,
            width as i32 + 1,
            height as i32 + 1,
            diameter,
            diameter,
        );
        if region.is_null() {
            return false;
        }
        if SetWindowRgn(hwnd, region, 1) == 0 {
            DeleteObject(region);
            return false;
        }
        // Windows owns the region after a successful SetWindowRgn.
        true
    }
}

pub(super) fn acrylic(hwnd: HWND, enabled: bool, dark: bool) -> bool {
    // This is the same Windows 11 system backdrop used by Electron's
    // backgroundMaterial: "acrylic". No desktop capture or application blur loop.
    if enabled
        && attribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &i32::from(dark))
        && attribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &DWMSBT_TRANSIENTWINDOW)
    {
        return true;
    }
    let _ = attribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &DWMSBT_NONE);
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::{
        Graphics::Dwm::DwmGetWindowAttribute,
        UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, WS_EX_NOREDIRECTIONBITMAP, WS_POPUP,
        },
    };

    struct TestWindow(HWND);

    impl Drop for TestWindow {
        fn drop(&mut self) {
            unsafe { DestroyWindow(self.0) };
        }
    }

    #[test]
    fn system_material_uses_native_clipping_and_can_return_to_solid() {
        let class: Vec<_> = "STATIC\0".encode_utf16().collect();
        let window = TestWindow(unsafe {
            CreateWindowExW(
                WS_EX_NOREDIRECTIONBITMAP,
                class.as_ptr(),
                ptr::null(),
                WS_POPUP,
                0,
                0,
                400,
                480,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null(),
            )
        });
        assert!(!window.0.is_null());
        assert!(fallback_corners(window.0, 400, 480, 16));
        let region = unsafe { CreateRectRgn(0, 0, 0, 0) };
        assert!(!region.is_null());
        assert_ne!(unsafe { GetWindowRgn(window.0, region) }, 0);
        if native_corners(window.0) {
            assert_eq!(unsafe { GetWindowRgn(window.0, region) }, 0);
            if acrylic(window.0, true, false) {
                let mut material = 0_i32;
                assert!(
                    unsafe {
                        DwmGetWindowAttribute(
                            window.0,
                            DWMWA_SYSTEMBACKDROP_TYPE as _,
                            &mut material as *mut _ as _,
                            size_of_val(&material) as _,
                        )
                    } >= 0
                );
                assert_eq!(material, DWMSBT_TRANSIENTWINDOW);
                assert!(!acrylic(window.0, false, false));
                assert!(
                    unsafe {
                        DwmGetWindowAttribute(
                            window.0,
                            DWMWA_SYSTEMBACKDROP_TYPE as _,
                            &mut material as *mut _ as _,
                            size_of_val(&material) as _,
                        )
                    } >= 0
                );
                assert_eq!(material, DWMSBT_NONE);
            }
        } else {
            // Older Windows retains the bounded, solid fallback.
            assert_ne!(unsafe { GetWindowRgn(window.0, region) }, 0);
        }
        unsafe { DeleteObject(region) };
        assert!(!acrylic(ptr::null_mut(), true, false));
        assert!(!native_corners(ptr::null_mut()));
    }
}

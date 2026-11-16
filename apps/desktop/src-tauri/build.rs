fn main() {
    println!("cargo:rerun-if-changed=../../../packages/i18n/locales");
    for icon in ["icons/icon.png", "icons/icon.ico", "icons/icon.icns"] {
        println!("cargo:rerun-if-changed={icon}");
    }
    tauri_build::build();
}

use std::io;

#[cfg(windows)]
use std::{ffi::OsString, os::windows::ffi::OsStrExt, path::Path};
#[cfg(windows)]
use winreg::{
    RegKey, RegValue,
    enums::{HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE},
    types::ToRegValue,
};

pub const LOGIN_ARG: &str = "--autostart";

pub fn from_login() -> bool {
    std::env::args_os().skip(1).any(|arg| arg == LOGIN_ARG)
}

pub fn available() -> bool {
    cfg!(windows) && !tauri::is_dev() && std::env::var_os("SIMPLE_COPY_DATA_DIR").is_none()
}

pub type Undo = Box<dyn FnOnce() -> io::Result<()>>;

#[cfg(not(windows))]
pub fn apply(_identifier: &str, _enabled: bool) -> io::Result<Option<Undo>> {
    Err(io::ErrorKind::Unsupported.into())
}

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

#[cfg(windows)]
pub fn apply(identifier: &str, enabled: bool) -> io::Result<Option<Undo>> {
    let command = if enabled {
        Some(login_command(&std::env::current_exe()?)?)
    } else {
        None
    };
    let desired = command.as_ref().map(ToRegValue::to_reg_value);
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let access = KEY_QUERY_VALUE | KEY_SET_VALUE;
    let key = if enabled {
        user.create_subkey_with_flags(RUN_KEY, access)?.0
    } else if let Some(key) = optional(user.open_subkey_with_flags(RUN_KEY, access))? {
        key
    } else {
        return Ok(None);
    };
    let previous = optional(key.get_raw_value(identifier))?;
    if desired == previous {
        return Ok(None);
    }
    write_value(&key, identifier, desired.as_ref())?;
    let identifier = identifier.to_owned();
    Ok(Some(Box::new(move || {
        write_value(&key, &identifier, previous.as_ref())
    })))
}

#[cfg(windows)]
fn optional<T>(result: io::Result<T>) -> io::Result<Option<T>> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn write_value(key: &RegKey, identifier: &str, value: Option<&RegValue>) -> io::Result<()> {
    match value {
        Some(value) => key.set_raw_value(identifier, value),
        None => optional(key.delete_value(identifier)).map(|_| ()),
    }
}

#[cfg(windows)]
fn login_command(executable: &Path) -> io::Result<OsString> {
    let mut command = OsString::from("\"");
    command.push(executable);
    command.push("\" ");
    command.push(LOGIN_ARG);
    // Windows limits Run values to 260 characters.
    if command.encode_wide().count() > 260 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Windows startup command exceeds 260 characters",
        ));
    }
    Ok(command)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn login_command_quotes_the_executable_and_passes_the_startup_flag() {
        let executable = Path::new(r"C:\Program Files\简单复制\simple-copy.exe");
        assert_eq!(
            login_command(executable).unwrap(),
            r#""C:\Program Files\简单复制\simple-copy.exe" --autostart"#
        );
        let long_path = format!(r"C:\{}\simple-copy.exe", "a".repeat(240));
        assert!(login_command(Path::new(&long_path)).is_err());
    }
}

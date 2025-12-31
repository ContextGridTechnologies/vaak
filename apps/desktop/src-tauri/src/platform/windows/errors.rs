use crate::platform::common::PlatformError;
use windows::core::{Error, HRESULT};

pub(crate) fn windows_error(context: &str, err: Error) -> PlatformError {
    PlatformError::new("windows_error", format!("{}: {}", context, err))
}

pub(crate) fn windows_error_hresult(context: &str, hr: HRESULT) -> PlatformError {
    windows_error(context, Error::from(hr))
}

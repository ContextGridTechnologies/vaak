use crate::platform::common::PlatformError;
use crate::platform::windows::errors::windows_error_hresult;
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};

pub(crate) struct ComInit {
    should_uninit: bool,
}

impl ComInit {
    pub(crate) fn new() -> Result<Self, PlatformError> {
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if hr.is_ok() {
            return Ok(Self { should_uninit: true });
        }

        if hr == RPC_E_CHANGED_MODE {
            return Ok(Self { should_uninit: false });
        }

        Err(windows_error_hresult("CoInitializeEx", hr))
    }
}

impl Drop for ComInit {
    fn drop(&mut self) {
        if self.should_uninit {
            unsafe { CoUninitialize() };
        }
    }
}

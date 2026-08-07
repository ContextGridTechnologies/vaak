use crate::providers::errors::{ProviderError, ProviderFailure};
use rmcp::{
    model::CallToolRequestParams, service::RunningService, transport::TokioChildProcess,
    RoleClient, ServiceExt,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::Mutex;

const FLAUI_VERSION: &str = "0.2.0";

#[cfg(target_arch = "x86_64")]
pub const FLAUI_ARCHIVE_NAME: &str = "FlaUI-MCP-win-x64-0.2.0-self-contained.zip";
#[cfg(target_arch = "x86_64")]
const FLAUI_ARCHIVE_SHA256: &str =
    "6428bb38aef433d8754b48cbaaff4f1eca5e98c107e89b0ad90399a9fcb1a106";

#[cfg(target_arch = "aarch64")]
pub const FLAUI_ARCHIVE_NAME: &str = "FlaUI-MCP-win-arm64-0.2.0-self-contained.zip";
#[cfg(target_arch = "aarch64")]
const FLAUI_ARCHIVE_SHA256: &str =
    "1a00162fc1a7c3fac924dfc5702cd66deb51d3a9f6a870c1e339a3defb6e20a4";

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpDiscoveredTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

pub struct McpRuntimeManager {
    install_root: PathBuf,
    bundled_archive: Option<PathBuf>,
    clients: Mutex<HashMap<String, Option<RunningService<RoleClient, ()>>>>,
}

impl McpRuntimeManager {
    #[cfg(test)]
    pub fn new(app_data_dir: impl AsRef<Path>) -> Self {
        Self {
            install_root: app_data_dir.as_ref().join("mcp").join("flaui-mcp"),
            bundled_archive: None,
            clients: Mutex::new(HashMap::new()),
        }
    }

    pub fn with_bundled_archive(
        app_data_dir: impl AsRef<Path>,
        bundled_archive: impl Into<PathBuf>,
    ) -> Self {
        Self {
            install_root: app_data_dir.as_ref().join("mcp").join("flaui-mcp"),
            bundled_archive: Some(bundled_archive.into()),
            clients: Mutex::new(HashMap::new()),
        }
    }

    pub fn executable_path(&self) -> PathBuf {
        self.install_root.join(FLAUI_VERSION).join("FlaUI.Mcp.exe")
    }

    pub fn provision_bundled(&self, archive_path: &Path) -> Result<bool, ProviderError> {
        self.provision_archive(archive_path, FLAUI_ARCHIVE_SHA256)
    }

    pub fn install_bundled(&self) -> Result<bool, ProviderError> {
        let archive = self
            .bundled_archive
            .as_deref()
            .ok_or_else(|| runtime_error("FlaUI MCP bundled archive is unavailable"))?;
        self.provision_bundled(archive)
    }

    fn provision_archive(
        &self,
        archive_path: &Path,
        expected_sha256: &str,
    ) -> Result<bool, ProviderError> {
        if sha256_file(archive_path)? != expected_sha256 {
            return Err(runtime_error(
                "FlaUI MCP archive failed SHA-256 verification",
            ));
        }
        fs::create_dir_all(&self.install_root).map_err(io_error)?;
        let _install_lock = InstallLock::acquire(self.install_root.join(".install.lock"))?;
        let target = self.install_root.join(FLAUI_VERSION);
        let marker = target.join(".archive-sha256");
        if self.executable_path().is_file()
            && fs::read_to_string(marker).is_ok_and(|digest| digest.trim() == expected_sha256)
        {
            return Ok(false);
        }

        let staging = self
            .install_root
            .join(format!("{FLAUI_VERSION}.staging-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&staging).map_err(io_error)?;
        let result = (|| {
            extract_archive(archive_path, &staging)?;
            if !staging.join("FlaUI.Mcp.exe").is_file() {
                return Err(runtime_error("FlaUI MCP archive is missing FlaUI.Mcp.exe"));
            }
            fs::write(staging.join(".archive-sha256"), expected_sha256).map_err(io_error)?;
            if target.exists() {
                fs::remove_dir_all(&target).map_err(io_error)?;
            }
            fs::rename(&staging, &target).map_err(io_error)?;
            Ok(true)
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(staging);
        }
        result
    }

    pub async fn list_tools(&self) -> Result<Vec<McpDiscoveredTool>, ProviderError> {
        let result = self.list_tools_for("manager.health").await;
        self.stop_session("manager.health").await;
        result
    }

    pub async fn list_tools_for(
        &self,
        runtime_session_id: &str,
    ) -> Result<Vec<McpDiscoveredTool>, ProviderError> {
        validate_runtime_session_id(runtime_session_id)?;
        let mut clients = self.clients.lock().await;
        let client = clients.entry(runtime_session_id.to_string()).or_default();
        self.ensure_client(client).await?;
        let request = tokio::time::timeout(
            Duration::from_secs(10),
            client
                .as_ref()
                .expect("client was initialized")
                .list_all_tools(),
        )
        .await;
        let tools = match request {
            Ok(Ok(tools)) => tools,
            Ok(Err(err)) => {
                client.take();
                return Err(runtime_error(format!(
                    "FlaUI MCP tool discovery failed: {err}"
                )));
            }
            Err(_) => {
                client.take();
                return Err(runtime_error("FlaUI MCP tool discovery timed out"));
            }
        };

        tools
            .into_iter()
            .filter(|tool| {
                super::FLAUI_TOOLS
                    .iter()
                    .any(|(name, _)| *name == tool.name)
            })
            .map(|tool| {
                let input_schema = serde_json::Value::Object((*tool.input_schema).clone());
                if serde_json::to_vec(&input_schema).map_or(true, |json| json.len() > 64 * 1024) {
                    return Err(runtime_error("FlaUI MCP returned an invalid tool schema"));
                }
                Ok(McpDiscoveredTool {
                    name: tool.name.into_owned(),
                    description: tool
                        .description
                        .map_or_else(String::new, |value| value.into_owned()),
                    input_schema,
                })
            })
            .collect()
    }

    pub async fn call_tool_for(
        &self,
        runtime_session_id: &str,
        name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, ProviderError> {
        validate_runtime_session_id(runtime_session_id)?;
        if !super::FLAUI_TOOLS
            .iter()
            .any(|(tool_name, _)| *tool_name == name)
        {
            return Err(runtime_error(
                "FlaUI MCP tool is not in the reviewed catalog",
            ));
        }
        validate_flaui_call(name, &arguments, foreground_window_title().as_deref())?;
        let serde_json::Value::Object(arguments) = arguments else {
            return Err(runtime_error("MCP tool arguments must be a JSON object"));
        };
        if serde_json::to_vec(&arguments).map_or(true, |json| json.len() > 1024 * 1024) {
            return Err(runtime_error("MCP tool arguments are too large"));
        }

        let mut clients = self.clients.lock().await;
        let client = clients.entry(runtime_session_id.to_string()).or_default();
        self.ensure_client(client).await?;
        let request = tokio::time::timeout(
            Duration::from_secs(35),
            client
                .as_ref()
                .expect("client was initialized")
                .call_tool(CallToolRequestParams::new(name.to_string()).with_arguments(arguments)),
        )
        .await;
        let result = match request {
            Ok(Ok(result)) => result,
            Ok(Err(err)) => {
                client.take();
                return Err(runtime_error(format!("FlaUI MCP tool call failed: {err}")));
            }
            Err(_) => {
                client.take();
                return Err(runtime_error("FlaUI MCP tool call timed out"));
            }
        };
        let mut result = serde_json::to_value(result)
            .map_err(|_| runtime_error("FlaUI MCP returned an invalid tool result"))?;
        if name == "windows_list_windows" {
            redact_protected_windows(&mut result);
        }
        Ok(result)
    }

    pub async fn stop(&self) {
        let mut clients = self.clients.lock().await;
        for client in clients.values_mut() {
            if let Some(mut client) = client.take() {
                let _ = client.close_with_timeout(Duration::from_secs(3)).await;
            }
        }
        clients.clear();
    }

    pub async fn stop_session(&self, runtime_session_id: &str) {
        let client = self.clients.lock().await.remove(runtime_session_id);
        if let Some(Some(mut client)) = client {
            let _ = client.close_with_timeout(Duration::from_secs(3)).await;
        }
    }

    #[cfg(test)]
    async fn active_runtime_count(&self) -> usize {
        self.clients
            .lock()
            .await
            .values()
            .filter(|client| client.as_ref().is_some_and(|client| !client.is_closed()))
            .count()
    }

    pub async fn uninstall(&self) -> Result<bool, ProviderError> {
        self.stop().await;
        let target = self.install_root.join(FLAUI_VERSION);
        if !target.exists() {
            return Ok(false);
        }
        fs::remove_dir_all(target).map_err(io_error)?;
        Ok(true)
    }

    async fn ensure_client(
        &self,
        client: &mut Option<RunningService<RoleClient, ()>>,
    ) -> Result<(), ProviderError> {
        if client.as_ref().is_some_and(|service| !service.is_closed()) {
            return Ok(());
        }
        let executable = self.executable_path();
        if !executable.is_file() {
            return Err(runtime_error("FlaUI MCP is not installed"));
        }
        let mut command = tokio::process::Command::new(&executable);
        command.current_dir(
            executable
                .parent()
                .expect("installed executable has a parent"),
        );
        let transport = TokioChildProcess::new(command)
            .map_err(|err| runtime_error(format!("could not start FlaUI MCP: {err}")))?;
        let service = tokio::time::timeout(Duration::from_secs(10), ().serve(transport))
            .await
            .map_err(|_| runtime_error("FlaUI MCP startup timed out"))?
            .map_err(|err| runtime_error(format!("FlaUI MCP startup failed: {err}")))?;
        *client = Some(service);
        Ok(())
    }
}

struct InstallLock(PathBuf);

impl InstallLock {
    fn acquire(path: PathBuf) -> Result<Self, ProviderError> {
        fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .and_then(|mut file| writeln!(file, "{}", std::process::id()))
            .map_err(|err| runtime_error(format!("FlaUI MCP installation is busy: {err}")))?;
        Ok(Self(path))
    }
}

impl Drop for InstallLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn sha256_file(path: &Path) -> Result<String, ProviderError> {
    let mut file = fs::File::open(path).map_err(io_error)?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(io_error)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn extract_archive(archive_path: &Path, destination: &Path) -> Result<(), ProviderError> {
    let file = fs::File::open(archive_path).map_err(io_error)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|err| runtime_error(format!("invalid FlaUI MCP archive: {err}")))?;
    if archive.len() > 64 {
        return Err(runtime_error("FlaUI MCP archive contains too many files"));
    }
    let mut extracted_bytes = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|err| runtime_error(format!("invalid FlaUI MCP archive entry: {err}")))?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| runtime_error("FlaUI MCP archive contains an unsafe path"))?;
        extracted_bytes = extracted_bytes.saturating_add(entry.size());
        if extracted_bytes > 256 * 1024 * 1024 {
            return Err(runtime_error("FlaUI MCP archive is too large"));
        }
        let output = destination.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(output).map_err(io_error)?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(io_error)?;
        }
        let mut output = fs::File::create(output).map_err(io_error)?;
        std::io::copy(&mut entry, &mut output).map_err(io_error)?;
        output.sync_all().map_err(io_error)?;
    }
    Ok(())
}

fn validate_flaui_call(
    name: &str,
    arguments: &serde_json::Value,
    foreground_title: Option<&str>,
) -> Result<(), ProviderError> {
    let object = arguments
        .as_object()
        .ok_or_else(|| runtime_error("MCP tool arguments must be a JSON object"))?;
    if matches!(name, "windows_batch" | "windows_close") {
        return Err(ProviderError::new(
            "mcp_tool_denied",
            "this FlaUI tool is disabled by Vaak policy",
        ));
    }
    if matches!(name, "windows_snapshot" | "windows_screenshot") && object.contains_key("handle") {
        return Err(ProviderError::new(
            "mcp_tool_denied",
            "window handles are not accepted for this FlaUI tool",
        ));
    }
    if name == "windows_focus" {
        if object.contains_key("handle") {
            return Err(ProviderError::new(
                "mcp_tool_denied",
                "focus a window by reviewed title, not by handle",
            ));
        }
        let title = object.get("title").and_then(serde_json::Value::as_str);
        if title.is_none() || title.is_some_and(is_protected_window_title) {
            return Err(ProviderError::new(
                "mcp_tool_denied",
                "Vaak windows and untitled targets cannot be focused by the agent",
            ));
        }
    }
    if name == "windows_launch"
        && object
            .get("app")
            .and_then(serde_json::Value::as_str)
            .is_some_and(is_protected_window_title)
    {
        return Err(ProviderError::new(
            "mcp_tool_denied",
            "the agent cannot launch or target Vaak",
        ));
    }
    if matches!(
        name,
        "windows_snapshot"
            | "windows_click"
            | "windows_type"
            | "windows_send_keys"
            | "windows_fill"
            | "windows_get_text"
            | "windows_screenshot"
    ) && foreground_title.is_none_or(is_protected_window_title)
    {
        return Err(ProviderError::new(
            "mcp_tool_denied",
            "switch to a non-Vaak application before running this tool",
        ));
    }
    Ok(())
}

fn redact_protected_windows(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(text) => {
            *text = text
                .lines()
                .filter(|line| !is_protected_window_title(line))
                .collect::<Vec<_>>()
                .join("\n");
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact_protected_windows(value);
            }
        }
        serde_json::Value::Object(values) => {
            for value in values.values_mut() {
                redact_protected_windows(value);
            }
        }
        _ => {}
    }
}

fn is_protected_window_title(value: &str) -> bool {
    value.to_ascii_lowercase().contains("vaak")
}

#[cfg(windows)]
fn foreground_window_title() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    };

    let window = unsafe { GetForegroundWindow() };
    if window.0 == 0 {
        return None;
    }
    let length = unsafe { GetWindowTextLengthW(window) };
    if length <= 0 {
        return None;
    }
    let mut buffer = vec![0_u16; length as usize + 1];
    let copied = unsafe { GetWindowTextW(window, &mut buffer) };
    (copied > 0).then(|| String::from_utf16_lossy(&buffer[..copied as usize]))
}

#[cfg(not(windows))]
fn foreground_window_title() -> Option<String> {
    None
}

fn io_error(err: std::io::Error) -> ProviderError {
    ProviderFailure::SettingsStore(err.to_string()).into()
}

fn runtime_error(message: impl Into<String>) -> ProviderError {
    ProviderError::new("mcp_runtime_failed", message.into())
}

fn validate_runtime_session_id(value: &str) -> Result<(), ProviderError> {
    if value.trim().is_empty() || value.len() > 128 || value.chars().any(char::is_control) {
        Err(runtime_error("invalid MCP runtime session ID"))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("vaak-mcp-runtime-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_archive(path: &Path, entries: &[(&str, &[u8])]) -> String {
        let file = fs::File::create(path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        for (name, contents) in entries {
            archive
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            archive.write_all(contents).unwrap();
        }
        archive.finish().unwrap();
        let bytes = fs::read(path).unwrap();
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn provisions_a_verified_archive_atomically_and_idempotently() {
        let dir = temp_dir("install");
        let archive = dir.join("flaui.zip");
        let digest = write_archive(&archive, &[("FlaUI.Mcp.exe", b"test-server")]);
        let runtime = McpRuntimeManager::new(&dir);

        assert!(runtime.provision_archive(&archive, &digest).unwrap());
        assert_eq!(fs::read(runtime.executable_path()).unwrap(), b"test-server");
        assert!(!runtime.provision_archive(&archive, &digest).unwrap());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_digest_mismatch_and_zip_traversal() {
        let dir = temp_dir("reject");
        let archive = dir.join("flaui.zip");
        let digest = write_archive(&archive, &[("../outside.exe", b"bad")]);
        let runtime = McpRuntimeManager::new(&dir);

        assert!(runtime.provision_archive(&archive, "wrong").is_err());
        assert!(runtime.provision_archive(&archive, &digest).is_err());
        assert!(!dir.join("outside.exe").exists());

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn flaui_policy_blocks_batch_destructive_and_vaak_targeting_paths() {
        assert!(validate_flaui_call("windows_batch", &serde_json::json!({}), None).is_err());
        assert!(
            validate_flaui_call("windows_close", &serde_json::json!({ "handle": "1" }), None)
                .is_err()
        );
        assert!(validate_flaui_call(
            "windows_snapshot",
            &serde_json::json!({ "handle": "1" }),
            None
        )
        .is_err());
        assert!(
            validate_flaui_call("windows_snapshot", &serde_json::json!({}), Some("Vaak")).is_err()
        );
        assert!(validate_flaui_call(
            "windows_focus",
            &serde_json::json!({ "title": "Vaak" }),
            None
        )
        .is_err());
        assert!(validate_flaui_call(
            "windows_focus",
            &serde_json::json!({ "title": "Notepad" }),
            None
        )
        .is_ok());
    }

    #[test]
    fn protected_window_titles_are_removed_from_mcp_results() {
        let mut result = serde_json::json!({
            "content": [{ "type": "text", "text": "0x1 Notepad\n0x2 Vaak\n0x3 Calculator" }]
        });

        redact_protected_windows(&mut result);

        assert_eq!(result["content"][0]["text"], "0x1 Notepad\n0x3 Calculator");
    }

    #[test]
    #[ignore = "requires the downloaded pinned FlaUI MCP Windows runtime"]
    fn live_pinned_flaui_runtime_reports_the_reviewed_tool_surface() {
        let dir = temp_dir("live");
        let archive = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("mcp")
            .join(FLAUI_ARCHIVE_NAME);
        let runtime = McpRuntimeManager::with_bundled_archive(&dir, archive);
        runtime.install_bundled().unwrap();
        let tokio = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let tools = tokio
            .block_on(runtime.list_tools_for("voice-session-a"))
            .unwrap();
        assert_eq!(tools.len(), 12);
        assert!(tools.iter().any(|tool| tool.name == "windows_snapshot"));
        assert!(tools.iter().any(|tool| tool.name == "windows_click"));
        let windows = tokio
            .block_on(runtime.call_tool_for(
                "voice-session-a",
                "windows_list_windows",
                serde_json::json!({}),
            ))
            .unwrap();
        assert_ne!(windows["isError"], serde_json::json!(true));
        assert!(windows["content"].is_array());
        tokio
            .block_on(runtime.list_tools_for("voice-session-b"))
            .unwrap();
        assert_eq!(tokio.block_on(runtime.active_runtime_count()), 2);
        tokio.block_on(runtime.stop_session("voice-session-a"));
        assert_eq!(tokio.block_on(runtime.active_runtime_count()), 1);
        tokio.block_on(runtime.stop());

        fs::remove_dir_all(dir).unwrap();
    }
}

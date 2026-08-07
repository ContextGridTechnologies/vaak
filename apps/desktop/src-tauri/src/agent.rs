use crate::providers::errors::ProviderError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const AGENT_SESSION_TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderCreationStatus {
    Created,
    AlreadyExists,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderCreationResult {
    pub status: FolderCreationStatus,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateFolderArguments {
    path: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolDefinition {
    pub alias: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolSnapshot {
    pub session_id: String,
    pub revision: u64,
    pub tools: Vec<AgentToolDefinition>,
    pub instructions: Vec<String>,
}

pub struct AgentToolBroker {
    home: Option<PathBuf>,
    session_ttl: Duration,
    sessions: Mutex<HashMap<String, AgentToolSession>>,
}

struct AgentToolSession {
    window_label: String,
    revision: u64,
    expires_at: Instant,
    tools: HashMap<String, SessionTool>,
    used_provider_call_ids: HashSet<String>,
    pending_approvals: HashMap<String, PendingMcpApproval>,
}

#[derive(Clone, Copy)]
enum NativeTool {
    CreateFolder,
}

#[derive(Clone)]
enum SessionTool {
    Native(NativeTool),
    Mcp {
        connector_id: String,
        name: String,
        policy: String,
        risk: String,
    },
}

struct PendingMcpApproval {
    connector_id: String,
    name: String,
    policy: String,
    risk: String,
    arguments: Value,
}

#[derive(Clone, Debug)]
pub struct AgentMcpTool {
    pub connector_id: String,
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    pub policy: String,
    pub risk: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum AgentPreparedToolCall {
    Complete(Value),
    Mcp {
        connector_id: String,
        name: String,
        policy: String,
        risk: String,
        arguments: Value,
    },
    ApprovalRequired {
        approval_id: String,
        tool_name: String,
        risk: String,
    },
}

impl Default for AgentToolBroker {
    fn default() -> Self {
        Self {
            home: dirs::home_dir(),
            session_ttl: AGENT_SESSION_TTL,
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

impl AgentToolBroker {
    #[cfg(test)]
    fn for_home(home: PathBuf) -> Self {
        Self::for_home_with_ttl(home, AGENT_SESSION_TTL)
    }

    #[cfg(test)]
    fn for_home_with_ttl(home: PathBuf, session_ttl: Duration) -> Self {
        Self {
            home: Some(home),
            session_ttl,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    #[cfg(test)]
    pub fn create_snapshot(&self, window_label: &str) -> AgentToolSnapshot {
        self.create_snapshot_with_mcp(window_label, Vec::new())
    }

    #[cfg(test)]
    pub fn create_snapshot_with_mcp(
        &self,
        window_label: &str,
        mcp_tools: Vec<AgentMcpTool>,
    ) -> AgentToolSnapshot {
        self.create_snapshot_with_mcp_and_instructions(window_label, mcp_tools, Vec::new())
    }

    pub fn create_snapshot_with_mcp_and_instructions(
        &self,
        window_label: &str,
        mcp_tools: Vec<AgentMcpTool>,
        instructions: Vec<String>,
    ) -> AgentToolSnapshot {
        let session_id = uuid::Uuid::new_v4().to_string();
        let alias = format!("tool_{}", uuid::Uuid::new_v4().simple());
        let mut session_tools =
            HashMap::from([(alias.clone(), SessionTool::Native(NativeTool::CreateFolder))]);
        let mut definitions = vec![AgentToolDefinition {
            alias,
            description: "Create a folder inside the user's home directory.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "A relative path inside the home directory."
                    }
                },
                "required": ["path"],
                "additionalProperties": false
            }),
        }];
        for tool in mcp_tools {
            let alias = format!("tool_{}", uuid::Uuid::new_v4().simple());
            definitions.push(AgentToolDefinition {
                alias: alias.clone(),
                description: tool.description,
                input_schema: tool.input_schema,
            });
            session_tools.insert(
                alias,
                SessionTool::Mcp {
                    connector_id: tool.connector_id,
                    name: tool.name,
                    policy: tool.policy,
                    risk: tool.risk,
                },
            );
        }
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(
                session_id.clone(),
                AgentToolSession {
                    window_label: window_label.to_string(),
                    revision: 1,
                    expires_at: Instant::now() + self.session_ttl,
                    tools: session_tools,
                    used_provider_call_ids: HashSet::new(),
                    pending_approvals: HashMap::new(),
                },
            );

        AgentToolSnapshot {
            session_id,
            revision: 1,
            tools: definitions,
            instructions,
        }
    }

    #[cfg(test)]
    pub fn execute(
        &self,
        session_id: &str,
        window_label: &str,
        revision: u64,
        alias: &str,
        provider_call_id: &str,
        arguments: Value,
    ) -> Result<Value, ProviderError> {
        match self.prepare_execution(
            session_id,
            window_label,
            revision,
            alias,
            provider_call_id,
            arguments,
        )? {
            AgentPreparedToolCall::Complete(result) => Ok(result),
            AgentPreparedToolCall::Mcp { .. } => Err(ProviderError::new(
                "agent_tool_failed",
                "MCP tool requires the async runtime",
            )),
            AgentPreparedToolCall::ApprovalRequired { .. } => Err(ProviderError::new(
                "mcp_approval_required",
                "MCP tool requires approval",
            )),
        }
    }

    pub fn prepare_execution(
        &self,
        session_id: &str,
        window_label: &str,
        revision: u64,
        alias: &str,
        provider_call_id: &str,
        arguments: Value,
    ) -> Result<AgentPreparedToolCall, ProviderError> {
        if provider_call_id.trim().is_empty()
            || provider_call_id.len() > 256
            || provider_call_id.chars().any(char::is_control)
        {
            return Err(ProviderError::new(
                "invalid_agent_tool_call",
                "voice agent tool call ID is invalid",
            ));
        }
        let tool = {
            let mut sessions = self
                .sessions
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let now = Instant::now();
            sessions.retain(|_, session| session.expires_at > now);
            let session = sessions.get_mut(session_id).ok_or_else(invalid_session)?;
            if session.window_label != window_label || session.revision != revision {
                return Err(invalid_session());
            }
            if !session.pending_approvals.is_empty() {
                return Err(ProviderError::new(
                    "agent_approval_pending",
                    "resolve the pending voice agent approval before another tool call",
                ));
            }
            let tool = session
                .tools
                .get(alias)
                .cloned()
                .ok_or_else(invalid_session)?;
            if !session
                .used_provider_call_ids
                .insert(provider_call_id.to_string())
            {
                return Err(ProviderError::new(
                    "replayed_agent_tool_call",
                    "voice agent tool call was already handled",
                ));
            }
            tool
        };

        match tool {
            SessionTool::Native(NativeTool::CreateFolder) => {
                let home = self.home.as_deref().ok_or_else(|| {
                    ProviderError::new("agent_tool_failed", "home directory is unavailable")
                })?;
                let arguments: CreateFolderArguments =
                    serde_json::from_value(arguments).map_err(|_| {
                        ProviderError::new(
                            "invalid_agent_tool_arguments",
                            "create_folder requires only a string path",
                        )
                    })?;
                serde_json::to_value(create_folder_under(home, &arguments.path)?)
                    .map(AgentPreparedToolCall::Complete)
                    .map_err(|_| {
                        ProviderError::new("agent_tool_failed", "could not serialize tool result")
                    })
            }
            SessionTool::Mcp {
                connector_id,
                name,
                policy,
                risk,
            } if policy == "ask" => {
                let approval_id = format!("approval_{}", uuid::Uuid::new_v4().simple());
                let mut sessions = self
                    .sessions
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let session = sessions.get_mut(session_id).ok_or_else(invalid_session)?;
                if session.window_label != window_label || session.revision != revision {
                    return Err(invalid_session());
                }
                session.pending_approvals.insert(
                    approval_id.clone(),
                    PendingMcpApproval {
                        connector_id,
                        name: name.clone(),
                        policy,
                        risk: risk.clone(),
                        arguments,
                    },
                );
                Ok(AgentPreparedToolCall::ApprovalRequired {
                    approval_id,
                    tool_name: name,
                    risk,
                })
            }
            SessionTool::Mcp {
                connector_id,
                name,
                policy,
                risk,
            } => Ok(AgentPreparedToolCall::Mcp {
                connector_id,
                name,
                policy,
                risk,
                arguments,
            }),
        }
    }

    pub fn resolve_approval(
        &self,
        session_id: &str,
        window_label: &str,
        approval_id: &str,
        approved: bool,
    ) -> Result<AgentPreparedToolCall, ProviderError> {
        if approval_id.trim().is_empty()
            || approval_id.len() > 128
            || approval_id.chars().any(char::is_control)
        {
            return Err(invalid_session());
        }
        let pending = {
            let mut sessions = self
                .sessions
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let now = Instant::now();
            sessions.retain(|_, session| session.expires_at > now);
            let session = sessions.get_mut(session_id).ok_or_else(invalid_session)?;
            if session.window_label != window_label {
                return Err(invalid_session());
            }
            session
                .pending_approvals
                .remove(approval_id)
                .ok_or_else(invalid_session)?
        };
        if !approved {
            return Ok(AgentPreparedToolCall::Complete(serde_json::json!({
                "status": "denied",
                "tool": pending.name,
            })));
        }
        Ok(AgentPreparedToolCall::Mcp {
            connector_id: pending.connector_id,
            name: pending.name,
            policy: pending.policy,
            risk: pending.risk,
            arguments: pending.arguments,
        })
    }

    pub fn release_snapshot(&self, session_id: &str, window_label: &str) -> bool {
        let mut sessions = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if sessions
            .get(session_id)
            .is_some_and(|session| session.window_label == window_label)
        {
            sessions.remove(session_id);
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
pub fn execute_tool(name: &str, arguments: Value) -> Result<Value, ProviderError> {
    if name != "create_folder" {
        return Err(ProviderError::new(
            "unknown_agent_tool",
            format!("voice agent tool is not registered: {name}"),
        ));
    }

    let arguments: CreateFolderArguments = serde_json::from_value(arguments).map_err(|_| {
        ProviderError::new(
            "invalid_agent_tool_arguments",
            "create_folder requires only a string path",
        )
    })?;
    let home = dirs::home_dir()
        .ok_or_else(|| ProviderError::new("agent_tool_failed", "home directory is unavailable"))?;
    serde_json::to_value(create_folder_under(&home, &arguments.path)?)
        .map_err(|_| ProviderError::new("agent_tool_failed", "could not serialize tool result"))
}

fn create_folder_under(home: &Path, input: &str) -> Result<FolderCreationResult, ProviderError> {
    let input = input.trim();
    if input.is_empty() || input.len() > 4096 || input.contains('\0') {
        return Err(invalid_path());
    }

    let relative = Path::new(input);
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(invalid_path());
    }

    let home = home
        .canonicalize()
        .map_err(|_| ProviderError::new("agent_tool_failed", "home directory is unavailable"))?;
    let target = home.join(relative);
    ensure_existing_ancestor_is_under_home(&home, &target)?;

    if target.exists() {
        let canonical_target = target.canonicalize().map_err(|_| {
            ProviderError::new("agent_tool_failed", "could not inspect the requested path")
        })?;
        if !canonical_target.starts_with(&home) {
            return Err(invalid_path());
        }
        if target.is_dir() {
            return Ok(folder_result(FolderCreationStatus::AlreadyExists, relative));
        }
        return Err(ProviderError::new(
            "agent_tool_failed",
            "the requested path already contains a file",
        ));
    }

    std::fs::create_dir_all(&target).map_err(|error| {
        ProviderError::new(
            "agent_tool_failed",
            format!("could not create folder: {error}"),
        )
    })?;
    let canonical_target = target.canonicalize().map_err(|_| {
        ProviderError::new("agent_tool_failed", "could not verify the created folder")
    })?;
    if !canonical_target.starts_with(&home) {
        return Err(invalid_path());
    }

    Ok(folder_result(FolderCreationStatus::Created, relative))
}

fn ensure_existing_ancestor_is_under_home(home: &Path, target: &Path) -> Result<(), ProviderError> {
    let mut ancestor = PathBuf::from(target);
    while !ancestor.exists() {
        if !ancestor.pop() {
            return Err(invalid_path());
        }
    }
    let canonical_ancestor = ancestor.canonicalize().map_err(|_| invalid_path())?;
    if canonical_ancestor.starts_with(home) {
        Ok(())
    } else {
        Err(invalid_path())
    }
}

fn folder_result(status: FolderCreationStatus, relative: &Path) -> FolderCreationResult {
    FolderCreationResult {
        status,
        path: relative
            .components()
            .filter_map(|component| match component {
                Component::Normal(part) => Some(part.to_string_lossy()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/"),
    }
}

fn invalid_path() -> ProviderError {
    ProviderError::new(
        "invalid_agent_tool_arguments",
        "path must be a relative folder path inside the home directory",
    )
}

fn invalid_session() -> ProviderError {
    ProviderError::new(
        "invalid_agent_session",
        "voice agent session or tool is unavailable",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_home() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("vaak-agent-test-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn creates_a_nested_folder_under_the_given_home() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();

        let result = create_folder_under(&home, "Desktop/Vaak Agent Test").unwrap();

        assert_eq!(result.status, FolderCreationStatus::Created);
        assert_eq!(result.path, "Desktop/Vaak Agent Test");
        assert!(home.join("Desktop").join("Vaak Agent Test").is_dir());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn reports_an_existing_folder_without_overwriting_it() {
        let home = test_home();
        let target = home.join("Desktop").join("Existing");
        fs::create_dir_all(&target).unwrap();

        let result = create_folder_under(&home, "Desktop/Existing").unwrap();

        assert_eq!(result.status, FolderCreationStatus::AlreadyExists);
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn rejects_paths_that_can_escape_the_home_directory() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();

        for path in ["../outside", "Desktop/../../outside", "C:\\outside"] {
            let error = create_folder_under(&home, path).unwrap_err();
            assert_eq!(error.code, "invalid_agent_tool_arguments", "{path}");
        }

        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn rejects_a_path_that_already_contains_a_file() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();
        fs::write(home.join("notes"), b"keep me").unwrap();

        let error = create_folder_under(&home, "notes").unwrap_err();

        assert_eq!(error.code, "agent_tool_failed");
        assert_eq!(fs::read(home.join("notes")).unwrap(), b"keep me");
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn broker_snapshot_uses_an_opaque_alias_and_rust_owned_schema() {
        let broker = AgentToolBroker::for_home(test_home());

        let snapshot = broker.create_snapshot("main");

        assert_eq!(snapshot.revision, 1);
        assert_eq!(snapshot.tools.len(), 1);
        assert_ne!(snapshot.tools[0].alias, "create_folder");
        assert_eq!(
            snapshot.tools[0].description,
            "Create a folder inside the user's home directory."
        );
        assert_eq!(
            snapshot.tools[0].input_schema["required"],
            serde_json::json!(["path"])
        );
    }

    #[test]
    fn broker_maps_a_granted_mcp_tool_to_an_opaque_session_target() {
        let broker = AgentToolBroker::for_home(test_home());
        let snapshot = broker.create_snapshot_with_mcp(
            "voice-capsule",
            vec![AgentMcpTool {
                connector_id: "connector.test".to_string(),
                name: "windows_snapshot".to_string(),
                description: "Inspect the active Windows application.".to_string(),
                input_schema: serde_json::json!({ "type": "object" }),
                policy: "always".to_string(),
                risk: "read".to_string(),
            }],
        );

        assert_eq!(snapshot.tools.len(), 2);
        assert_ne!(snapshot.tools[1].alias, "windows_snapshot");
        assert_eq!(
            broker
                .prepare_execution(
                    &snapshot.session_id,
                    "voice-capsule",
                    snapshot.revision,
                    &snapshot.tools[1].alias,
                    "mcp-provider-call",
                    serde_json::json!({ "window": "Notepad" }),
                )
                .unwrap(),
            AgentPreparedToolCall::Mcp {
                connector_id: "connector.test".to_string(),
                name: "windows_snapshot".to_string(),
                policy: "always".to_string(),
                risk: "read".to_string(),
                arguments: serde_json::json!({ "window": "Notepad" }),
            }
        );
    }

    #[test]
    fn ask_policy_requires_a_session_bound_one_time_approval() {
        let broker = AgentToolBroker::for_home(test_home());
        let snapshot = broker.create_snapshot_with_mcp(
            "main",
            vec![AgentMcpTool {
                connector_id: "connector.test".to_string(),
                name: "windows_click".to_string(),
                description: "Click a control.".to_string(),
                input_schema: serde_json::json!({ "type": "object" }),
                policy: "ask".to_string(),
                risk: "mutating".to_string(),
            }],
        );
        let prepared = broker
            .prepare_execution(
                &snapshot.session_id,
                "main",
                snapshot.revision,
                &snapshot.tools[1].alias,
                "approval-call",
                serde_json::json!({ "ref": "e1" }),
            )
            .unwrap();
        let AgentPreparedToolCall::ApprovalRequired { approval_id, .. } = prepared else {
            panic!("expected approval challenge");
        };
        assert!(broker
            .prepare_execution(
                &snapshot.session_id,
                "main",
                snapshot.revision,
                &snapshot.tools[1].alias,
                "second-approval-call",
                serde_json::json!({ "ref": "e2" }),
            )
            .is_err());

        assert_eq!(
            broker
                .resolve_approval(&snapshot.session_id, "main", &approval_id, true)
                .unwrap(),
            AgentPreparedToolCall::Mcp {
                connector_id: "connector.test".to_string(),
                name: "windows_click".to_string(),
                policy: "ask".to_string(),
                risk: "mutating".to_string(),
                arguments: serde_json::json!({ "ref": "e1" }),
            }
        );
        assert!(broker
            .resolve_approval(&snapshot.session_id, "main", &approval_id, true)
            .is_err());
    }

    #[test]
    fn broker_executes_an_opaque_tool_only_for_its_matching_session() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();
        let broker = AgentToolBroker::for_home(home.clone());
        let snapshot = broker.create_snapshot("voice-capsule");

        let result = broker
            .execute(
                &snapshot.session_id,
                "voice-capsule",
                snapshot.revision,
                &snapshot.tools[0].alias,
                "provider-call-1",
                serde_json::json!({ "path": "Desktop/Broker Test" }),
            )
            .unwrap();

        assert_eq!(result["status"], "created");
        assert!(home.join("Desktop").join("Broker Test").is_dir());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn broker_rejects_a_replayed_provider_call() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();
        let broker = AgentToolBroker::for_home(home.clone());
        let snapshot = broker.create_snapshot("main");
        let execute = || {
            broker.execute(
                &snapshot.session_id,
                "main",
                snapshot.revision,
                &snapshot.tools[0].alias,
                "same-provider-call",
                serde_json::json!({ "path": "Replay Test" }),
            )
        };

        execute().unwrap();
        let error = execute().unwrap_err();

        assert_eq!(error.code, "replayed_agent_tool_call");
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn releasing_a_snapshot_invalidates_its_tools() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();
        let broker = AgentToolBroker::for_home(home.clone());
        let snapshot = broker.create_snapshot("main");

        assert!(broker.release_snapshot(&snapshot.session_id, "main"));
        let error = broker
            .execute(
                &snapshot.session_id,
                "main",
                snapshot.revision,
                &snapshot.tools[0].alias,
                "provider-call-after-release",
                serde_json::json!({ "path": "Should Not Exist" }),
            )
            .unwrap_err();

        assert_eq!(error.code, "invalid_agent_session");
        assert!(!home.join("Should Not Exist").exists());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn broker_rejects_cross_window_and_stale_revision_calls() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();
        let broker = AgentToolBroker::for_home(home.clone());
        let snapshot = broker.create_snapshot("voice-capsule");

        for (window_label, revision) in [
            ("main", snapshot.revision),
            ("voice-capsule", snapshot.revision + 1),
        ] {
            let error = broker
                .execute(
                    &snapshot.session_id,
                    window_label,
                    revision,
                    &snapshot.tools[0].alias,
                    &format!("call-{window_label}-{revision}"),
                    serde_json::json!({ "path": "Rejected" }),
                )
                .unwrap_err();
            assert_eq!(error.code, "invalid_agent_session");
        }

        assert!(!home.join("Rejected").exists());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn broker_rejects_expired_snapshots() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();
        let broker = AgentToolBroker::for_home_with_ttl(home.clone(), std::time::Duration::ZERO);
        let snapshot = broker.create_snapshot("main");

        let error = broker
            .execute(
                &snapshot.session_id,
                "main",
                snapshot.revision,
                &snapshot.tools[0].alias,
                "expired-call",
                serde_json::json!({ "path": "Expired" }),
            )
            .unwrap_err();

        assert_eq!(error.code, "invalid_agent_session");
        assert!(!home.join("Expired").exists());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn broker_rejects_an_invalid_provider_call_id() {
        let home = test_home();
        fs::create_dir_all(&home).unwrap();
        let broker = AgentToolBroker::for_home(home.clone());
        let snapshot = broker.create_snapshot("main");
        let long_call_id = "x".repeat(257);

        for provider_call_id in ["", "   ", long_call_id.as_str()] {
            let error = broker
                .execute(
                    &snapshot.session_id,
                    "main",
                    snapshot.revision,
                    &snapshot.tools[0].alias,
                    provider_call_id,
                    serde_json::json!({ "path": "Invalid Call" }),
                )
                .unwrap_err();
            assert_eq!(error.code, "invalid_agent_tool_call");
        }

        assert!(!home.join("Invalid Call").exists());
        fs::remove_dir_all(home).unwrap();
    }
}

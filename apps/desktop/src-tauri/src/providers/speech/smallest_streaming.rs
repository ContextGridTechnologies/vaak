use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::sync::mpsc::error::TrySendError;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::streaming_common::{
    Pcm16FrameChunker, StreamingAudioWrite, StreamingSessionState,
};
use crate::providers::ProviderTimelineEvent;

const DEFAULT_STREAMING_HOST: &str = "api.smallest.ai";
const DEFAULT_STREAMING_MODEL: &str = "pulse";
const DEFAULT_STREAMING_LANGUAGE_CODE: &str = "en";
const DEFAULT_SAMPLE_RATE_HZ: u32 = 16_000;
const DEFAULT_FRAME_BYTES: usize = 4_096;
const DEFAULT_ENCODING: &str = "linear16";
const AUDIO_CHANNEL_CAPACITY: usize = 64;
const EVENT_CHANNEL_CAPACITY: usize = 64;
const PROVIDER_ID: &str = "smallest";
const PROVIDER_MODE: &str = "streaming";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SmallestStreamingProfile {
    pub(crate) provider_id: &'static str,
    pub(crate) sample_rate_hz: u32,
    pub(crate) channel_count: u8,
    pub(crate) sample_format: &'static str,
    pub(crate) bytes_per_frame: usize,
    pub(crate) provider_encoding: &'static str,
    pub(crate) transport_encoding: &'static str,
    pub(crate) language_code: &'static str,
}

impl Default for SmallestStreamingProfile {
    fn default() -> Self {
        Self {
            provider_id: PROVIDER_ID,
            sample_rate_hz: DEFAULT_SAMPLE_RATE_HZ,
            channel_count: 1,
            sample_format: "pcm_s16le",
            bytes_per_frame: DEFAULT_FRAME_BYTES,
            provider_encoding: DEFAULT_ENCODING,
            transport_encoding: "websocket_binary",
            language_code: DEFAULT_STREAMING_LANGUAGE_CODE,
        }
    }
}

#[derive(Debug)]
pub(crate) struct SmallestStreamingSession {
    audio_tx: mpsc::Sender<StreamingClientMessage>,
    events_rx: mpsc::Receiver<SmallestStreamingOutput>,
    chunker: Pcm16FrameChunker,
    state: Arc<StreamingSessionState>,
    dropped_frames: Arc<AtomicU64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmallestStreamingStartResult {
    pub(crate) provider_id: String,
    pub(crate) model_id: String,
    pub(crate) provider_mode: String,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmallestStreamingCommandEvent {
    pub(crate) event_type: String,
    pub(crate) session_id: Option<String>,
    pub(crate) sequence: Option<u32>,
    pub(crate) text: Option<String>,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

pub(crate) async fn start_managed_session(
    api_key: &str,
    state: Arc<ManagedSmallestStreamingState>,
    events: tauri::ipc::Channel<SmallestStreamingCommandEvent>,
    model: Option<String>,
) -> Result<SmallestStreamingStartResult, ProviderError> {
    let config = SmallestStreamingConfig::with_model(model)?;
    let model_id = config.model.clone();
    let session = SmallestStreamingSession::connect_with_config(api_key, config).await?;
    let snapshot = SmallestStreamingSnapshot::new("pending".to_string(), model_id.clone());
    let started_events = snapshot.provider_events.clone();
    let (handle, mut events_rx) = session.into_handle_and_events(snapshot.session_id.clone());
    state.try_start(handle)?;

    tokio::spawn(async move {
        let mut snapshot = snapshot;
        while let Some(output) = events_rx.recv().await {
            let payload = command_event_from_output(&mut snapshot, output);
            let is_terminal = matches!(payload.event_type.as_str(), "terminated" | "error");
            let _ = events.send(payload);
            if is_terminal {
                let _ = state.take_active();
                break;
            }
        }
    });

    Ok(SmallestStreamingStartResult {
        provider_id: PROVIDER_ID.to_string(),
        model_id,
        provider_mode: PROVIDER_MODE.to_string(),
        provider_events: started_events,
    })
}

fn command_event_from_output(
    snapshot: &mut SmallestStreamingSnapshot,
    output: SmallestStreamingOutput,
) -> SmallestStreamingCommandEvent {
    snapshot.record_output(&output);
    let provider_events = snapshot
        .provider_events
        .last()
        .cloned()
        .into_iter()
        .collect::<Vec<_>>();
    match output {
        SmallestStreamingOutput::Partial {
            sequence,
            session_id,
            text,
        } => SmallestStreamingCommandEvent {
            event_type: "partial".to_string(),
            session_id: session_id.or_else(|| Some(snapshot.session_id.clone())),
            sequence: Some(sequence),
            text: Some(text),
            provider_events,
        },
        SmallestStreamingOutput::Final {
            sequence,
            session_id,
            text,
        } => SmallestStreamingCommandEvent {
            event_type: "final".to_string(),
            session_id: session_id.or_else(|| Some(snapshot.session_id.clone())),
            sequence: Some(sequence),
            text: Some(text),
            provider_events,
        },
        SmallestStreamingOutput::Terminated { session_id } => SmallestStreamingCommandEvent {
            event_type: "terminated".to_string(),
            session_id: session_id.or_else(|| Some(snapshot.session_id.clone())),
            sequence: None,
            text: None,
            provider_events,
        },
        SmallestStreamingOutput::Error { .. } => SmallestStreamingCommandEvent {
            event_type: "error".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: None,
            text: None,
            provider_events,
        },
        SmallestStreamingOutput::Ignored => SmallestStreamingCommandEvent {
            event_type: "ignored".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: None,
            text: None,
            provider_events: Vec::new(),
        },
    }
}

impl SmallestStreamingSession {
    pub(crate) async fn connect_with_config(
        api_key: &str,
        config: SmallestStreamingConfig,
    ) -> Result<Self, ProviderError> {
        let request = config.build_request(api_key)?;
        let (socket, _) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|error| ProviderFailure::Request(error.to_string()))?;
        let (mut writer, mut reader) = socket.split();
        let (audio_tx, mut audio_rx) = mpsc::channel(AUDIO_CHANNEL_CAPACITY);
        let (events_tx, events_rx) = mpsc::channel(EVENT_CHANNEL_CAPACITY);
        let state = Arc::new(StreamingSessionState::default());
        let writer_state = Arc::clone(&state);
        let reader_state = Arc::clone(&state);

        tokio::spawn(async move {
            while let Some(message) = audio_rx.recv().await {
                match message {
                    StreamingClientMessage::Audio(frame) => {
                        if writer.send(Message::Binary(frame.into())).await.is_err() {
                            break;
                        }
                    }
                    StreamingClientMessage::CloseStream => {
                        let _ = writer
                            .send(Message::Text(close_stream_message_json().into()))
                            .await;
                        continue;
                    }
                }
            }
            writer_state.request_stop();
        });

        tokio::spawn(async move {
            let mut sequence = 0_u32;
            while let Some(message) = reader.next().await {
                let Ok(message) = message else {
                    let _ = events_tx
                        .send(SmallestStreamingOutput::Error {
                            message: "Smallest AI streaming websocket read failed".to_string(),
                        })
                        .await;
                    reader_state.request_stop();
                    break;
                };

                if let Ok(text) = message.to_text() {
                    match parse_streaming_event(text) {
                        Ok(event) => {
                            let output =
                                SmallestStreamingOutput::from_event_with_sequence(event, sequence);
                            if matches!(
                                output,
                                SmallestStreamingOutput::Partial { .. }
                                    | SmallestStreamingOutput::Final { .. }
                            ) {
                                sequence = sequence.saturating_add(1);
                            }
                            let should_stop =
                                matches!(output, SmallestStreamingOutput::Terminated { .. });
                            if events_tx.send(output).await.is_err() {
                                break;
                            }
                            if should_stop {
                                reader_state.request_stop();
                                break;
                            }
                        }
                        Err(_) => {
                            let _ = events_tx
                                .send(SmallestStreamingOutput::Error {
                                    message: "Smallest AI streaming event was invalid".to_string(),
                                })
                                .await;
                        }
                    }
                }
            }
        });

        Ok(Self {
            audio_tx,
            events_rx,
            chunker: Pcm16FrameChunker::new(config.profile.bytes_per_frame)?,
            state,
            dropped_frames: Arc::new(AtomicU64::new(0)),
        })
    }

    pub(crate) fn into_handle_and_events(
        self,
        _session_id: String,
    ) -> (
        StreamingSessionHandle,
        mpsc::Receiver<SmallestStreamingOutput>,
    ) {
        (
            StreamingSessionHandle {
                audio_tx: Some(self.audio_tx),
                chunker: self.chunker,
                stop_state: self.state,
                dropped_frames: self.dropped_frames,
            },
            self.events_rx,
        )
    }
}

#[derive(Debug, Default)]
pub(crate) struct ManagedSmallestStreamingState {
    active: Mutex<Option<StreamingSessionHandle>>,
}

impl ManagedSmallestStreamingState {
    pub(crate) fn try_start(&self, handle: StreamingSessionHandle) -> Result<(), ProviderError> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| ProviderFailure::Request("streaming state lock failed".to_string()))?;
        if active.is_some() {
            return Err(ProviderFailure::InvalidRequest(
                "Smallest AI streaming session is already active".to_string(),
            )
            .into());
        }
        *active = Some(handle);
        Ok(())
    }

    pub(crate) fn send_pcm16(&self, bytes: Vec<u8>) -> Result<StreamingAudioWrite, ProviderError> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| ProviderFailure::Request("streaming state lock failed".to_string()))?;
        let Some(handle) = active.as_mut() else {
            return Err(ProviderFailure::InvalidRequest(
                "no active Smallest AI streaming session".to_string(),
            )
            .into());
        };
        handle.send_pcm16(&bytes)
    }

    pub(crate) fn request_stop(&self) -> bool {
        self.active
            .lock()
            .ok()
            .and_then(|mut active| active.as_mut().map(StreamingSessionHandle::request_stop))
            .unwrap_or(false)
    }

    pub(crate) fn take_active(&self) -> Option<StreamingSessionHandle> {
        self.active.lock().ok()?.take()
    }
}

#[derive(Debug)]
pub(crate) struct StreamingSessionHandle {
    audio_tx: Option<mpsc::Sender<StreamingClientMessage>>,
    chunker: Pcm16FrameChunker,
    stop_state: Arc<StreamingSessionState>,
    dropped_frames: Arc<AtomicU64>,
}

impl StreamingSessionHandle {
    #[cfg(test)]
    fn test_with_sender(_session_id: &str, audio_tx: mpsc::Sender<StreamingClientMessage>) -> Self {
        Self {
            audio_tx: Some(audio_tx),
            chunker: Pcm16FrameChunker::new(DEFAULT_FRAME_BYTES).expect("test frame config"),
            stop_state: Arc::new(StreamingSessionState::default()),
            dropped_frames: Arc::new(AtomicU64::new(0)),
        }
    }

    fn send_pcm16(&mut self, bytes: &[u8]) -> Result<StreamingAudioWrite, ProviderError> {
        let frames = self.chunker.push(bytes);
        let frame_count = frames.len();
        let bytes_sent = frames.iter().map(Vec::len).sum::<usize>();
        let Some(audio_tx) = &self.audio_tx else {
            return Ok(StreamingAudioWrite {
                bytes_sent,
                frame_count,
                dropped_frames: self.dropped_frames(),
            });
        };
        for frame in frames {
            if let Err(error) = audio_tx.try_send(StreamingClientMessage::Audio(frame)) {
                if matches!(error, TrySendError::Full(_)) {
                    self.dropped_frames.fetch_add(1, Ordering::Relaxed);
                    return Err(ProviderFailure::Request(
                        "Smallest AI streaming audio channel is full".to_string(),
                    )
                    .into());
                }
                return Err(ProviderFailure::Request(
                    "Smallest AI streaming audio channel is closed".to_string(),
                )
                .into());
            }
        }
        Ok(StreamingAudioWrite {
            bytes_sent,
            frame_count,
            dropped_frames: self.dropped_frames(),
        })
    }

    fn request_stop(&mut self) -> bool {
        if !self.stop_state.request_stop() {
            return false;
        }
        if let Some(audio_tx) = &self.audio_tx {
            if let Some(frame) = self.chunker.flush_padded_frame() {
                if let Err(error) = audio_tx.try_send(StreamingClientMessage::Audio(frame)) {
                    if matches!(error, TrySendError::Full(_)) {
                        self.dropped_frames.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
            let _ = audio_tx.try_send(StreamingClientMessage::CloseStream);
        }
        true
    }

    pub(crate) fn dropped_frames(&self) -> u64 {
        self.dropped_frames.load(Ordering::Relaxed)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmallestStreamingSnapshot {
    pub(crate) session_id: String,
    pub(crate) model_id: String,
    pub(crate) final_text: Option<String>,
    pub(crate) partial_count: u64,
    pub(crate) bytes_sent: i64,
    pub(crate) frame_count: i64,
    pub(crate) dropped_frames: i64,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

impl SmallestStreamingSnapshot {
    pub(crate) fn new(session_id: String, model_id: String) -> Self {
        let mut snapshot = Self {
            session_id,
            model_id,
            final_text: None,
            partial_count: 0,
            bytes_sent: 0,
            frame_count: 0,
            dropped_frames: 0,
            provider_events: Vec::new(),
        };
        snapshot.provider_events.push(snapshot.event(
            "stream_session_started",
            "connect",
            "succeeded",
            None,
        ));
        snapshot
    }

    pub(crate) fn record_output(&mut self, output: &SmallestStreamingOutput) {
        match output {
            SmallestStreamingOutput::Partial { .. } => {
                self.partial_count += 1;
                self.provider_events.push(self.event(
                    "stream_partial_received",
                    "receive",
                    "succeeded",
                    None,
                ));
            }
            SmallestStreamingOutput::Final { text, .. } => {
                self.final_text = Some(text.clone());
                self.provider_events.push(self.event(
                    "stream_final_received",
                    "receive",
                    "succeeded",
                    Some(json!({ "characterCount": text.chars().count() })),
                ));
            }
            SmallestStreamingOutput::Terminated { .. } => {
                self.provider_events.push(self.event(
                    "stream_terminated",
                    "terminate",
                    "succeeded",
                    Some(json!({ "droppedFrames": self.dropped_frames })),
                ));
            }
            SmallestStreamingOutput::Error { message } => {
                self.provider_events.push(ProviderTimelineEvent {
                    event_type: "stream_error".to_string(),
                    provider_id: PROVIDER_ID.to_string(),
                    model_id: Some(self.model_id.clone()),
                    provider_mode: PROVIDER_MODE.to_string(),
                    session_id: Some(self.session_id.clone()),
                    stage: Some("stream".to_string()),
                    started_at: Some(current_utc_timestamp()),
                    completed_at: Some(current_utc_timestamp()),
                    duration_ms: None,
                    status: Some("failed".to_string()),
                    error_code: Some("provider_request_failed".to_string()),
                    bytes_sent: Some(self.bytes_sent),
                    frame_count: Some(self.frame_count),
                    metadata: Some(json!({ "message": message })),
                });
            }
            SmallestStreamingOutput::Ignored => {}
        }
    }

    fn event(
        &self,
        event_type: &str,
        stage: &str,
        status: &str,
        metadata: Option<serde_json::Value>,
    ) -> ProviderTimelineEvent {
        let now = current_utc_timestamp();
        ProviderTimelineEvent {
            event_type: event_type.to_string(),
            provider_id: PROVIDER_ID.to_string(),
            model_id: Some(self.model_id.clone()),
            provider_mode: PROVIDER_MODE.to_string(),
            session_id: Some(self.session_id.clone()),
            stage: Some(stage.to_string()),
            started_at: Some(now.clone()),
            completed_at: Some(now),
            duration_ms: None,
            status: Some(status.to_string()),
            error_code: None,
            bytes_sent: Some(self.bytes_sent),
            frame_count: Some(self.frame_count),
            metadata,
        }
    }
}

#[derive(Clone, Debug)]
enum StreamingClientMessage {
    Audio(Vec<u8>),
    CloseStream,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SmallestStreamingOutput {
    Partial {
        sequence: u32,
        session_id: Option<String>,
        text: String,
    },
    Final {
        sequence: u32,
        session_id: Option<String>,
        text: String,
    },
    Terminated {
        session_id: Option<String>,
    },
    Error {
        message: String,
    },
    Ignored,
}

impl SmallestStreamingOutput {
    #[cfg(test)]
    fn from_event(event: SmallestStreamingEvent) -> Self {
        Self::from_event_with_sequence(event, 0)
    }

    fn from_event_with_sequence(event: SmallestStreamingEvent, sequence: u32) -> Self {
        if event.status.as_deref() == Some("error") || event.message.is_some() {
            return Self::Error {
                message: format!(
                    "Smallest AI streaming error: {}",
                    event
                        .message
                        .unwrap_or_else(|| "provider returned an error".to_string())
                ),
            };
        }

        if event.is_last.unwrap_or(false) {
            return Self::Terminated {
                session_id: event.session_id,
            };
        }

        let text = event.transcript.unwrap_or_default();
        if text.trim().is_empty() {
            return Self::Ignored;
        }

        if event.is_final.unwrap_or(false) {
            Self::Final {
                sequence,
                session_id: event.session_id,
                text,
            }
        } else {
            Self::Partial {
                sequence,
                session_id: event.session_id,
                text,
            }
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct SmallestStreamingConfig {
    host: String,
    model: String,
    language_code: String,
    encoding: String,
    sample_rate_hz: u32,
    profile: SmallestStreamingProfile,
}

impl Default for SmallestStreamingConfig {
    fn default() -> Self {
        let profile = SmallestStreamingProfile::default();
        Self {
            host: DEFAULT_STREAMING_HOST.to_string(),
            model: DEFAULT_STREAMING_MODEL.to_string(),
            language_code: profile.language_code.to_string(),
            encoding: profile.provider_encoding.to_string(),
            sample_rate_hz: profile.sample_rate_hz,
            profile,
        }
    }
}

impl SmallestStreamingConfig {
    pub(crate) fn with_model(model: Option<String>) -> Result<Self, ProviderError> {
        let mut config = Self::default();
        if let Some(model) = model
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            if model != DEFAULT_STREAMING_MODEL {
                return Err(ProviderFailure::InvalidRequest(
                    "Smallest AI streaming supports pulse only".to_string(),
                )
                .into());
            }
            config.model = model;
        }
        Ok(config)
    }

    pub(crate) fn build_request(&self, api_key: &str) -> Result<Request, ProviderError> {
        if api_key.trim().is_empty() {
            return Err(ProviderFailure::MissingCredential.into());
        }

        let url = format!(
            "wss://{}/waves/v1/stt/live?model={}&language={}&encoding={}&sample_rate={}",
            self.host, self.model, self.language_code, self.encoding, self.sample_rate_hz
        );
        let mut request = url
            .into_client_request()
            .map_err(|error| ProviderFailure::Request(error.to_string()))?;
        request.headers_mut().insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {api_key}"))
                .map_err(|error| ProviderFailure::Request(error.to_string()))?,
        );
        Ok(request)
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub(crate) struct SmallestStreamingEvent {
    #[serde(rename = "type")]
    pub(crate) event_type: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) session_id: Option<String>,
    pub(crate) transcript: Option<String>,
    pub(crate) is_final: Option<bool>,
    pub(crate) is_last: Option<bool>,
    pub(crate) message: Option<String>,
}

pub(crate) fn parse_streaming_event(
    payload: &str,
) -> Result<SmallestStreamingEvent, ProviderError> {
    serde_json::from_str(payload).map_err(|_| ProviderFailure::InvalidResponse.into())
}

fn close_stream_message_json() -> String {
    r#"{"type":"close_stream"}"#.to_string()
}

fn current_utc_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[test]
    fn streaming_config_builds_smallest_websocket_request_with_bearer_auth() {
        let config = SmallestStreamingConfig::with_model(Some("pulse".to_string()))
            .expect("config to build");

        let request = config
            .build_request("smallest-test-key")
            .expect("request to build");

        assert_eq!(
            request.uri().to_string(),
            "wss://api.smallest.ai/waves/v1/stt/live?model=pulse&language=en&encoding=linear16&sample_rate=16000"
        );
        assert_eq!(
            request
                .headers()
                .get("authorization")
                .and_then(|value| value.to_str().ok()),
            Some("Bearer smallest-test-key")
        );
    }

    #[test]
    fn smallest_streaming_profile_matches_provider_audio_requirements() {
        let profile = SmallestStreamingProfile::default();

        assert_eq!(profile.provider_id, "smallest");
        assert_eq!(profile.sample_rate_hz, 16_000);
        assert_eq!(profile.channel_count, 1);
        assert_eq!(profile.sample_format, "pcm_s16le");
        assert_eq!(profile.bytes_per_frame, 4_096);
        assert_eq!(profile.provider_encoding, "linear16");
        assert_eq!(profile.transport_encoding, "websocket_binary");
        assert_eq!(profile.language_code, "en");
    }

    #[test]
    fn rejects_empty_api_key_before_connect() {
        let err = SmallestStreamingConfig::default()
            .build_request("  ")
            .expect_err("empty key should fail");

        assert_eq!(err.code, "missing_provider_key");
    }

    #[test]
    fn rejects_non_pulse_streaming_model() {
        let err = SmallestStreamingConfig::with_model(Some("pulse-pro".to_string()))
            .expect_err("pulse-pro should not be accepted by live adapter");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err
            .message
            .contains("Smallest AI streaming supports pulse only"));
    }

    #[test]
    fn parses_partial_final_and_terminal_transcription_messages() {
        let partial = SmallestStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"transcription","status":"success","session_id":"session-1","transcript":"draft","is_final":false,"is_last":false}"#,
            )
            .expect("partial event"),
        );
        let final_output = SmallestStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"transcription","status":"success","session_id":"session-1","transcript":"final text","is_final":true,"is_last":false,"language":"en"}"#,
            )
            .expect("final event"),
        );
        let terminal = SmallestStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"transcription","status":"success","session_id":"session-1","transcript":"","is_final":true,"is_last":true,"language":"en"}"#,
            )
            .expect("terminal event"),
        );

        assert_eq!(
            partial,
            SmallestStreamingOutput::Partial {
                sequence: 0,
                session_id: Some("session-1".to_string()),
                text: "draft".to_string(),
            }
        );
        assert_eq!(
            final_output,
            SmallestStreamingOutput::Final {
                sequence: 0,
                session_id: Some("session-1".to_string()),
                text: "final text".to_string(),
            }
        );
        assert_eq!(
            terminal,
            SmallestStreamingOutput::Terminated {
                session_id: Some("session-1".to_string()),
            }
        );
    }

    #[test]
    fn malformed_streaming_payload_becomes_invalid_response() {
        let err = parse_streaming_event("not-json").expect_err("invalid json should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }

    #[test]
    fn provider_error_status_becomes_streaming_error() {
        let output = SmallestStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"error","status":"error","session_id":"session-1","message":"bad audio"}"#,
            )
            .expect("error event"),
        );

        assert_eq!(
            output,
            SmallestStreamingOutput::Error {
                message: "Smallest AI streaming error: bad audio".to_string(),
            }
        );
    }

    #[test]
    fn close_stream_message_uses_smallest_control_shape() {
        assert_eq!(close_stream_message_json(), r#"{"type":"close_stream"}"#);
    }

    #[test]
    fn streaming_handle_flushes_4096_byte_partial_frame_before_close() {
        let (audio_tx, mut audio_rx) = mpsc::channel(4);
        let mut handle = StreamingSessionHandle::test_with_sender("session-1", audio_tx);
        handle.send_pcm16(&[3; 10]).expect("partial write");

        assert!(handle.request_stop());

        match audio_rx.try_recv().expect("padded audio frame") {
            StreamingClientMessage::Audio(frame) => {
                assert_eq!(frame.len(), 4_096);
                assert_eq!(&frame[..10], &[3; 10]);
                assert!(frame[10..].iter().all(|byte| *byte == 0));
            }
            StreamingClientMessage::CloseStream => panic!("close arrived before audio flush"),
        }
        assert!(matches!(
            audio_rx.try_recv().expect("close message"),
            StreamingClientMessage::CloseStream,
        ));
    }

    #[test]
    fn streaming_handle_returns_error_instead_of_silently_dropping_full_channel_audio() {
        let (audio_tx, mut audio_rx) = mpsc::channel(1);
        audio_tx
            .try_send(StreamingClientMessage::Audio(vec![1; 4_096]))
            .expect("fill channel");
        let mut handle = StreamingSessionHandle::test_with_sender("session-1", audio_tx);

        let err = handle
            .send_pcm16(&[2; 4_096])
            .expect_err("full audio channel should fail");

        assert!(err
            .message
            .contains("Smallest AI streaming audio channel is full"));
        assert_eq!(handle.dropped_frames(), 1);
        assert!(matches!(
            audio_rx.try_recv().expect("queued message"),
            StreamingClientMessage::Audio(_),
        ));
    }
}

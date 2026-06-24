use base64::Engine;
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

const DEFAULT_STREAMING_HOST: &str = "api.elevenlabs.io";
const DEFAULT_STREAMING_MODEL: &str = "scribe_v2_realtime";
const DEFAULT_STREAMING_LANGUAGE_CODE: &str = "en";
const DEFAULT_SAMPLE_RATE_HZ: u32 = 16_000;
const DEFAULT_FRAME_BYTES: usize = 3_200;
const DEFAULT_AUDIO_FORMAT: &str = "pcm_16000";
const DEFAULT_COMMIT_STRATEGY: &str = "manual";
const AUDIO_CHANNEL_CAPACITY: usize = 64;
const EVENT_CHANNEL_CAPACITY: usize = 64;
const PROVIDER_ID: &str = "elevenlabs";
const PROVIDER_MODE: &str = "streaming";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ElevenLabsStreamingProfile {
    pub(crate) provider_id: &'static str,
    pub(crate) sample_rate_hz: u32,
    pub(crate) channel_count: u8,
    pub(crate) sample_format: &'static str,
    pub(crate) bytes_per_frame: usize,
    pub(crate) provider_audio_format: &'static str,
    pub(crate) transport_encoding: &'static str,
    pub(crate) commit_strategy: &'static str,
    pub(crate) language_code: &'static str,
}

impl Default for ElevenLabsStreamingProfile {
    fn default() -> Self {
        Self {
            provider_id: PROVIDER_ID,
            sample_rate_hz: DEFAULT_SAMPLE_RATE_HZ,
            channel_count: 1,
            sample_format: "pcm_s16le",
            bytes_per_frame: DEFAULT_FRAME_BYTES,
            provider_audio_format: DEFAULT_AUDIO_FORMAT,
            transport_encoding: "websocket_json_base64",
            commit_strategy: DEFAULT_COMMIT_STRATEGY,
            language_code: DEFAULT_STREAMING_LANGUAGE_CODE,
        }
    }
}

#[derive(Debug)]
pub(crate) struct ElevenLabsStreamingSession {
    audio_tx: mpsc::Sender<StreamingClientMessage>,
    events_rx: mpsc::Receiver<ElevenLabsStreamingOutput>,
    chunker: Pcm16FrameChunker,
    state: Arc<StreamingSessionState>,
    dropped_frames: Arc<AtomicU64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ElevenLabsStreamingStartResult {
    pub(crate) provider_id: String,
    pub(crate) model_id: String,
    pub(crate) provider_mode: String,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ElevenLabsStreamingCommandEvent {
    pub(crate) event_type: String,
    pub(crate) session_id: Option<String>,
    pub(crate) sequence: Option<u32>,
    pub(crate) text: Option<String>,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

pub(crate) async fn start_managed_session(
    api_key: &str,
    state: Arc<ManagedElevenLabsStreamingState>,
    events: tauri::ipc::Channel<ElevenLabsStreamingCommandEvent>,
    model: Option<String>,
) -> Result<ElevenLabsStreamingStartResult, ProviderError> {
    let config = ElevenLabsStreamingConfig::with_model(model)?;
    let model_id = config.model.clone();
    let session = ElevenLabsStreamingSession::connect_with_config(api_key, config).await?;
    let snapshot = ElevenLabsStreamingSnapshot::new("pending".to_string(), model_id.clone());
    let started_events = snapshot.provider_events.clone();
    let (handle, mut events_rx) = session.into_handle_and_events();
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

    Ok(ElevenLabsStreamingStartResult {
        provider_id: PROVIDER_ID.to_string(),
        model_id,
        provider_mode: PROVIDER_MODE.to_string(),
        provider_events: started_events,
    })
}

fn command_event_from_output(
    snapshot: &mut ElevenLabsStreamingSnapshot,
    output: ElevenLabsStreamingOutput,
) -> ElevenLabsStreamingCommandEvent {
    snapshot.record_output(&output);
    let provider_events = snapshot
        .provider_events
        .last()
        .cloned()
        .into_iter()
        .collect::<Vec<_>>();
    match output {
        ElevenLabsStreamingOutput::Began { session_id } => ElevenLabsStreamingCommandEvent {
            event_type: "began".to_string(),
            session_id: Some(session_id),
            sequence: None,
            text: None,
            provider_events,
        },
        ElevenLabsStreamingOutput::Partial {
            sequence,
            session_id,
            text,
        } => ElevenLabsStreamingCommandEvent {
            event_type: "partial".to_string(),
            session_id: session_id.or_else(|| Some(snapshot.session_id.clone())),
            sequence: Some(sequence),
            text: Some(text),
            provider_events,
        },
        ElevenLabsStreamingOutput::Final {
            sequence,
            session_id,
            text,
        } => ElevenLabsStreamingCommandEvent {
            event_type: "final".to_string(),
            session_id: session_id.or_else(|| Some(snapshot.session_id.clone())),
            sequence: Some(sequence),
            text: Some(text),
            provider_events,
        },
        ElevenLabsStreamingOutput::Terminated { session_id } => ElevenLabsStreamingCommandEvent {
            event_type: "terminated".to_string(),
            session_id: session_id.or_else(|| Some(snapshot.session_id.clone())),
            sequence: None,
            text: None,
            provider_events,
        },
        ElevenLabsStreamingOutput::Error { .. } => ElevenLabsStreamingCommandEvent {
            event_type: "error".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: None,
            text: None,
            provider_events,
        },
        ElevenLabsStreamingOutput::Ignored => ElevenLabsStreamingCommandEvent {
            event_type: "ignored".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: None,
            text: None,
            provider_events: Vec::new(),
        },
    }
}

impl ElevenLabsStreamingSession {
    pub(crate) async fn connect_with_config(
        api_key: &str,
        config: ElevenLabsStreamingConfig,
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
                        let payload = input_audio_chunk_message_json(&frame);
                        if writer.send(Message::Text(payload.into())).await.is_err() {
                            break;
                        }
                    }
                    StreamingClientMessage::CloseSession => {
                        let _ = writer.close().await;
                        break;
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
                        .send(ElevenLabsStreamingOutput::Error {
                            message: "ElevenLabs streaming websocket read failed".to_string(),
                        })
                        .await;
                    reader_state.request_stop();
                    break;
                };

                if message.is_close() {
                    let _ = events_tx
                        .send(ElevenLabsStreamingOutput::Terminated { session_id: None })
                        .await;
                    reader_state.request_stop();
                    break;
                }

                if let Ok(text) = message.to_text() {
                    match parse_streaming_event(text) {
                        Ok(event) => {
                            let output = ElevenLabsStreamingOutput::from_event_with_sequence(
                                event, sequence,
                            );
                            if matches!(
                                output,
                                ElevenLabsStreamingOutput::Partial { .. }
                                    | ElevenLabsStreamingOutput::Final { .. }
                            ) {
                                sequence = sequence.saturating_add(1);
                            }
                            let should_stop =
                                matches!(output, ElevenLabsStreamingOutput::Error { .. });
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
                                .send(ElevenLabsStreamingOutput::Error {
                                    message: "ElevenLabs streaming event was invalid".to_string(),
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
    ) -> (
        StreamingSessionHandle,
        mpsc::Receiver<ElevenLabsStreamingOutput>,
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
pub(crate) struct ManagedElevenLabsStreamingState {
    active: Mutex<Option<StreamingSessionHandle>>,
}

impl ManagedElevenLabsStreamingState {
    pub(crate) fn try_start(&self, handle: StreamingSessionHandle) -> Result<(), ProviderError> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| ProviderFailure::Request("streaming state lock failed".to_string()))?;
        if active.is_some() {
            return Err(ProviderFailure::InvalidRequest(
                "ElevenLabs streaming session is already active".to_string(),
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
                "no active ElevenLabs streaming session".to_string(),
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
    fn test_with_sender(audio_tx: mpsc::Sender<StreamingClientMessage>) -> Self {
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
                        "ElevenLabs streaming audio channel is full".to_string(),
                    )
                    .into());
                }
                return Err(ProviderFailure::Request(
                    "ElevenLabs streaming audio channel is closed".to_string(),
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
            let _ = audio_tx.try_send(StreamingClientMessage::CloseSession);
        }
        true
    }

    pub(crate) fn dropped_frames(&self) -> u64 {
        self.dropped_frames.load(Ordering::Relaxed)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ElevenLabsStreamingSnapshot {
    pub(crate) session_id: String,
    pub(crate) model_id: String,
    pub(crate) final_text: Option<String>,
    pub(crate) partial_count: u64,
    pub(crate) bytes_sent: i64,
    pub(crate) frame_count: i64,
    pub(crate) dropped_frames: i64,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

impl ElevenLabsStreamingSnapshot {
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

    pub(crate) fn record_output(&mut self, output: &ElevenLabsStreamingOutput) {
        match output {
            ElevenLabsStreamingOutput::Began { session_id } => {
                self.session_id = session_id.clone();
                self.provider_events.push(self.event(
                    "stream_session_began",
                    "receive",
                    "succeeded",
                    None,
                ));
            }
            ElevenLabsStreamingOutput::Partial { .. } => {
                self.partial_count += 1;
                self.provider_events.push(self.event(
                    "stream_partial_received",
                    "receive",
                    "succeeded",
                    None,
                ));
            }
            ElevenLabsStreamingOutput::Final { text, .. } => {
                self.final_text = Some(text.clone());
                self.provider_events.push(self.event(
                    "stream_final_received",
                    "receive",
                    "succeeded",
                    Some(json!({ "characterCount": text.chars().count() })),
                ));
            }
            ElevenLabsStreamingOutput::Terminated { .. } => {
                self.provider_events.push(self.event(
                    "stream_terminated",
                    "terminate",
                    "succeeded",
                    Some(json!({ "droppedFrames": self.dropped_frames })),
                ));
            }
            ElevenLabsStreamingOutput::Error { message } => {
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
            ElevenLabsStreamingOutput::Ignored => {}
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
    CloseSession,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum ElevenLabsStreamingOutput {
    Began {
        session_id: String,
    },
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

impl ElevenLabsStreamingOutput {
    #[cfg(test)]
    fn from_event(event: ElevenLabsStreamingEvent) -> Self {
        Self::from_event_with_sequence(event, 0)
    }

    fn from_event_with_sequence(event: ElevenLabsStreamingEvent, sequence: u32) -> Self {
        match event.message_type.as_deref() {
            Some("session_started") => {
                if let Some(session_id) = event.session_id {
                    Self::Began { session_id }
                } else {
                    Self::Ignored
                }
            }
            Some("partial_transcript") => text_output(event, sequence, false),
            Some("committed_transcript") | Some("committed_transcript_with_timestamps") => {
                text_output(event, sequence, true)
            }
            Some(message_type) if is_provider_error_message_type(message_type) => Self::Error {
                message: format!(
                    "ElevenLabs streaming error {message_type}: {}",
                    event.error_message()
                ),
            },
            _ => Self::Ignored,
        }
    }
}

fn text_output(
    event: ElevenLabsStreamingEvent,
    sequence: u32,
    final_result: bool,
) -> ElevenLabsStreamingOutput {
    let text = event.text.unwrap_or_default();
    if text.trim().is_empty() {
        return ElevenLabsStreamingOutput::Ignored;
    }
    if final_result {
        ElevenLabsStreamingOutput::Final {
            sequence,
            session_id: event.session_id,
            text,
        }
    } else {
        ElevenLabsStreamingOutput::Partial {
            sequence,
            session_id: event.session_id,
            text,
        }
    }
}

fn is_provider_error_message_type(message_type: &str) -> bool {
    matches!(
        message_type,
        "scribe_error"
            | "scribe_auth_error"
            | "scribe_quota_exceeded_error"
            | "scribe_throttled_error"
            | "scribe_unaccepted_terms_error"
            | "scribe_rate_limited_error"
            | "scribe_queue_overflow_error"
            | "scribe_resource_exhausted_error"
            | "scribe_session_time_limit_exceeded_error"
            | "scribe_input_error"
            | "scribe_chunk_size_exceeded_error"
            | "scribe_insufficient_audio_activity_error"
            | "scribe_transcriber_error"
    )
}

#[derive(Clone, Debug)]
pub(crate) struct ElevenLabsStreamingConfig {
    host: String,
    model: String,
    language_code: String,
    audio_format: String,
    commit_strategy: String,
    profile: ElevenLabsStreamingProfile,
}

impl Default for ElevenLabsStreamingConfig {
    fn default() -> Self {
        let profile = ElevenLabsStreamingProfile::default();
        Self {
            host: DEFAULT_STREAMING_HOST.to_string(),
            model: DEFAULT_STREAMING_MODEL.to_string(),
            language_code: profile.language_code.to_string(),
            audio_format: profile.provider_audio_format.to_string(),
            commit_strategy: profile.commit_strategy.to_string(),
            profile,
        }
    }
}

impl ElevenLabsStreamingConfig {
    pub(crate) fn with_model(model: Option<String>) -> Result<Self, ProviderError> {
        let mut config = Self::default();
        if let Some(model) = model
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            if model != DEFAULT_STREAMING_MODEL {
                return Err(ProviderFailure::InvalidRequest(
                    "ElevenLabs streaming supports scribe_v2_realtime only".to_string(),
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
            "wss://{}/v1/speech-to-text/realtime?model_id={}&audio_format={}&language_code={}&commit_strategy={}&include_timestamps=false&include_language_detection=false",
            self.host, self.model, self.audio_format, self.language_code, self.commit_strategy
        );
        let mut request = url
            .into_client_request()
            .map_err(|error| ProviderFailure::Request(error.to_string()))?;
        request.headers_mut().insert(
            "xi-api-key",
            HeaderValue::from_str(api_key)
                .map_err(|error| ProviderFailure::Request(error.to_string()))?,
        );
        Ok(request)
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub(crate) struct ElevenLabsStreamingEvent {
    pub(crate) message_type: Option<String>,
    pub(crate) session_id: Option<String>,
    pub(crate) text: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) message: Option<String>,
    pub(crate) detail: Option<String>,
}

impl ElevenLabsStreamingEvent {
    fn error_message(&self) -> String {
        self.error
            .clone()
            .or_else(|| self.message.clone())
            .or_else(|| self.detail.clone())
            .unwrap_or_else(|| "provider returned an error".to_string())
    }
}

pub(crate) fn parse_streaming_event(
    payload: &str,
) -> Result<ElevenLabsStreamingEvent, ProviderError> {
    serde_json::from_str(payload).map_err(|_| ProviderFailure::InvalidResponse.into())
}

fn input_audio_chunk_message_json(frame: &[u8]) -> String {
    let audio_base_64 = base64::engine::general_purpose::STANDARD.encode(frame);
    json!({
        "message_type": "input_audio_chunk",
        "audio_base_64": audio_base_64,
        "commit": true,
        "sample_rate": DEFAULT_SAMPLE_RATE_HZ,
    })
    .to_string()
}

fn current_utc_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tokio::sync::mpsc;

    #[test]
    fn streaming_config_builds_elevenlabs_websocket_request_with_api_key_header() {
        let config = ElevenLabsStreamingConfig::with_model(Some("scribe_v2_realtime".to_string()))
            .expect("config to build");

        let request = config
            .build_request("elevenlabs-test-key")
            .expect("request to build");

        assert_eq!(
            request.uri().to_string(),
            "wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&language_code=en&commit_strategy=manual&include_timestamps=false&include_language_detection=false"
        );
        assert_eq!(
            request
                .headers()
                .get("xi-api-key")
                .and_then(|value| value.to_str().ok()),
            Some("elevenlabs-test-key")
        );
    }

    #[test]
    fn elevenlabs_streaming_profile_matches_provider_audio_requirements() {
        let profile = ElevenLabsStreamingProfile::default();

        assert_eq!(profile.provider_id, "elevenlabs");
        assert_eq!(profile.sample_rate_hz, 16_000);
        assert_eq!(profile.channel_count, 1);
        assert_eq!(profile.sample_format, "pcm_s16le");
        assert_eq!(profile.bytes_per_frame, 3_200);
        assert_eq!(profile.provider_audio_format, "pcm_16000");
        assert_eq!(profile.transport_encoding, "websocket_json_base64");
        assert_eq!(profile.commit_strategy, "manual");
        assert_eq!(profile.language_code, "en");
    }

    #[test]
    fn rejects_empty_api_key_before_connect() {
        let err = ElevenLabsStreamingConfig::default()
            .build_request("  ")
            .expect_err("empty key should fail");

        assert_eq!(err.code, "missing_provider_key");
    }

    #[test]
    fn rejects_non_realtime_streaming_model() {
        let err = ElevenLabsStreamingConfig::with_model(Some("scribe_v2".to_string()))
            .expect_err("batch model should not be accepted by realtime adapter");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err
            .message
            .contains("ElevenLabs streaming supports scribe_v2_realtime only"));
    }

    #[test]
    fn input_audio_chunk_message_base64_encodes_pcm_frame() {
        let payload = input_audio_chunk_message_json(&[1, 2, 3, 4]);
        let parsed: Value = serde_json::from_str(&payload).expect("json payload");

        assert_eq!(parsed["message_type"], "input_audio_chunk");
        assert_eq!(parsed["audio_base_64"], "AQIDBA==");
        assert_eq!(parsed["commit"], true);
        assert_eq!(parsed["sample_rate"], 16_000);
    }

    #[test]
    fn parses_session_partial_final_and_timestamped_final_messages() {
        let began = ElevenLabsStreamingOutput::from_event(
            parse_streaming_event(r#"{"message_type":"session_started","session_id":"session-1"}"#)
                .expect("session event"),
        );
        let partial = ElevenLabsStreamingOutput::from_event(
            parse_streaming_event(r#"{"message_type":"partial_transcript","text":"draft"}"#)
                .expect("partial event"),
        );
        let final_output = ElevenLabsStreamingOutput::from_event(
            parse_streaming_event(r#"{"message_type":"committed_transcript","text":"final text"}"#)
                .expect("final event"),
        );
        let timestamped_final = ElevenLabsStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"message_type":"committed_transcript_with_timestamps","text":"timed final","language_code":"en","words":[]}"#,
            )
            .expect("timestamped final event"),
        );

        assert_eq!(
            began,
            ElevenLabsStreamingOutput::Began {
                session_id: "session-1".to_string(),
            }
        );
        assert_eq!(
            partial,
            ElevenLabsStreamingOutput::Partial {
                sequence: 0,
                session_id: None,
                text: "draft".to_string(),
            }
        );
        assert_eq!(
            final_output,
            ElevenLabsStreamingOutput::Final {
                sequence: 0,
                session_id: None,
                text: "final text".to_string(),
            }
        );
        assert_eq!(
            timestamped_final,
            ElevenLabsStreamingOutput::Final {
                sequence: 0,
                session_id: None,
                text: "timed final".to_string(),
            }
        );
    }

    #[test]
    fn malformed_streaming_payload_becomes_invalid_response() {
        let err = parse_streaming_event("not-json").expect_err("invalid json should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }

    #[test]
    fn provider_error_message_type_becomes_streaming_error() {
        let output = ElevenLabsStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"message_type":"scribe_chunk_size_exceeded_error","message":"chunk too large"}"#,
            )
            .expect("error event"),
        );

        assert_eq!(
            output,
            ElevenLabsStreamingOutput::Error {
                message:
                    "ElevenLabs streaming error scribe_chunk_size_exceeded_error: chunk too large"
                        .to_string(),
            }
        );
    }

    #[test]
    fn streaming_handle_flushes_3200_byte_partial_frame_before_close() {
        let (audio_tx, mut audio_rx) = mpsc::channel(4);
        let mut handle = StreamingSessionHandle::test_with_sender(audio_tx);
        handle.send_pcm16(&[3; 10]).expect("partial write");

        assert!(handle.request_stop());

        match audio_rx.try_recv().expect("padded audio frame") {
            StreamingClientMessage::Audio(frame) => {
                assert_eq!(frame.len(), 3_200);
                assert_eq!(&frame[..10], &[3; 10]);
                assert!(frame[10..].iter().all(|byte| *byte == 0));
            }
            StreamingClientMessage::CloseSession => panic!("close arrived before audio flush"),
        }
        assert!(matches!(
            audio_rx.try_recv().expect("close message"),
            StreamingClientMessage::CloseSession,
        ));
    }

    #[test]
    fn streaming_handle_returns_error_instead_of_silently_dropping_full_channel_audio() {
        let (audio_tx, mut audio_rx) = mpsc::channel(1);
        audio_tx
            .try_send(StreamingClientMessage::Audio(vec![1; 3_200]))
            .expect("fill channel");
        let mut handle = StreamingSessionHandle::test_with_sender(audio_tx);

        let err = handle
            .send_pcm16(&[2; 3_200])
            .expect_err("full audio channel should fail");

        assert!(err
            .message
            .contains("ElevenLabs streaming audio channel is full"));
        assert_eq!(handle.dropped_frames(), 1);
        assert!(matches!(
            audio_rx.try_recv().expect("queued message"),
            StreamingClientMessage::Audio(_),
        ));
    }
}

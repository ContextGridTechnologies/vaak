use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::sync::mpsc::error::TrySendError;
use tokio::time::{sleep, timeout, Duration};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::streaming_common::{
    Pcm16FrameChunker, StreamingAudioWrite, StreamingSessionState,
};
use crate::providers::ProviderTimelineEvent;

const DEFAULT_STREAMING_HOST: &str = "api.deepgram.com";
const DEFAULT_STREAMING_MODEL: &str = "nova-3";
const DEFAULT_STREAMING_LANGUAGE_CODE: &str = "en-US";
const DEFAULT_SAMPLE_RATE_HZ: u32 = 16_000;
const DEFAULT_FRAME_BYTES: usize = 3_200;
const DEFAULT_ENCODING: &str = "linear16";
const DEFAULT_ENDPOINTING_MS: u32 = 300;
const AUDIO_CHANNEL_CAPACITY: usize = 64;
const EVENT_CHANNEL_CAPACITY: usize = 64;
const KEEPALIVE_INTERVAL_SECONDS: u64 = 4;
const CLOSE_AFTER_FINALIZE_MS: u64 = 500;
const PROVIDER_ID: &str = "deepgram";
const PROVIDER_MODE: &str = "streaming";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DeepgramStreamingProfile {
    pub(crate) provider_id: &'static str,
    pub(crate) sample_rate_hz: u32,
    pub(crate) channel_count: u8,
    pub(crate) sample_format: &'static str,
    pub(crate) bytes_per_frame: usize,
    pub(crate) provider_encoding: &'static str,
    pub(crate) transport_encoding: &'static str,
    pub(crate) language_code: &'static str,
    pub(crate) endpointing_ms: u32,
}

impl Default for DeepgramStreamingProfile {
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
            endpointing_ms: DEFAULT_ENDPOINTING_MS,
        }
    }
}

#[derive(Debug)]
pub(crate) struct DeepgramStreamingSession {
    audio_tx: mpsc::Sender<StreamingClientMessage>,
    events_rx: mpsc::Receiver<DeepgramStreamingOutput>,
    chunker: Pcm16FrameChunker,
    state: Arc<StreamingSessionState>,
    dropped_frames: Arc<AtomicU64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeepgramStreamingStartResult {
    pub(crate) provider_id: String,
    pub(crate) model_id: String,
    pub(crate) provider_mode: String,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeepgramStreamingCommandEvent {
    pub(crate) event_type: String,
    pub(crate) session_id: Option<String>,
    pub(crate) sequence: Option<u32>,
    pub(crate) text: Option<String>,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

pub(crate) async fn start_managed_session(
    api_key: &str,
    state: Arc<ManagedDeepgramStreamingState>,
    events: tauri::ipc::Channel<DeepgramStreamingCommandEvent>,
    model: Option<String>,
) -> Result<DeepgramStreamingStartResult, ProviderError> {
    let config = DeepgramStreamingConfig::with_model(model)?;
    let model_id = config.model.clone();
    let session = DeepgramStreamingSession::connect_with_config(api_key, config).await?;
    let snapshot = DeepgramStreamingSnapshot::new("pending".to_string(), model_id.clone());
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

    Ok(DeepgramStreamingStartResult {
        provider_id: PROVIDER_ID.to_string(),
        model_id,
        provider_mode: PROVIDER_MODE.to_string(),
        provider_events: started_events,
    })
}

fn command_event_from_output(
    snapshot: &mut DeepgramStreamingSnapshot,
    output: DeepgramStreamingOutput,
) -> DeepgramStreamingCommandEvent {
    snapshot.record_output(&output);
    let provider_events = snapshot
        .provider_events
        .last()
        .cloned()
        .into_iter()
        .collect::<Vec<_>>();
    match output {
        DeepgramStreamingOutput::Partial { sequence, text } => DeepgramStreamingCommandEvent {
            event_type: "partial".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: Some(sequence),
            text: Some(text),
            provider_events,
        },
        DeepgramStreamingOutput::Final { sequence, text } => DeepgramStreamingCommandEvent {
            event_type: "final".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: Some(sequence),
            text: Some(text),
            provider_events,
        },
        DeepgramStreamingOutput::Terminated => DeepgramStreamingCommandEvent {
            event_type: "terminated".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: None,
            text: None,
            provider_events,
        },
        DeepgramStreamingOutput::Error { .. } => DeepgramStreamingCommandEvent {
            event_type: "error".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: None,
            text: None,
            provider_events,
        },
        DeepgramStreamingOutput::Ignored => DeepgramStreamingCommandEvent {
            event_type: "ignored".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            sequence: None,
            text: None,
            provider_events: Vec::new(),
        },
    }
}

impl DeepgramStreamingSession {
    pub(crate) async fn connect_with_config(
        api_key: &str,
        config: DeepgramStreamingConfig,
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
            loop {
                match timeout(
                    Duration::from_secs(KEEPALIVE_INTERVAL_SECONDS),
                    audio_rx.recv(),
                )
                .await
                {
                    Ok(Some(message)) => match message {
                        StreamingClientMessage::Audio(frame) => {
                            if writer.send(Message::Binary(frame.into())).await.is_err() {
                                break;
                            }
                        }
                        StreamingClientMessage::FinalizeAndClose => {
                            let _ = writer
                                .send(Message::Text(finalize_message_json().into()))
                                .await;
                            sleep(Duration::from_millis(CLOSE_AFTER_FINALIZE_MS)).await;
                            let _ = writer
                                .send(Message::Text(close_stream_message_json().into()))
                                .await;
                            break;
                        }
                    },
                    Ok(None) => break,
                    Err(_) => {
                        if writer
                            .send(Message::Text(keepalive_message_json().into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
            writer_state.request_stop();
        });

        tokio::spawn(async move {
            let mut sequence = 0_u32;
            let mut final_keys = HashSet::new();
            while let Some(message) = reader.next().await {
                let Ok(message) = message else {
                    let _ = events_tx
                        .send(DeepgramStreamingOutput::Error {
                            message: "Deepgram streaming websocket read failed".to_string(),
                        })
                        .await;
                    reader_state.request_stop();
                    break;
                };

                if message.is_close() {
                    let _ = events_tx.send(DeepgramStreamingOutput::Terminated).await;
                    reader_state.request_stop();
                    break;
                }

                if let Ok(text) = message.to_text() {
                    match parse_streaming_event(text) {
                        Ok(event) => {
                            let output = DeepgramStreamingOutput::from_event_with_sequence(
                                event,
                                sequence,
                                &mut final_keys,
                            );
                            if matches!(
                                output,
                                DeepgramStreamingOutput::Partial { .. }
                                    | DeepgramStreamingOutput::Final { .. }
                            ) {
                                sequence = sequence.saturating_add(1);
                            }
                            let should_stop = matches!(
                                output,
                                DeepgramStreamingOutput::Terminated
                                    | DeepgramStreamingOutput::Error { .. }
                            );
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
                                .send(DeepgramStreamingOutput::Error {
                                    message: "Deepgram streaming event was invalid".to_string(),
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
        mpsc::Receiver<DeepgramStreamingOutput>,
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
pub(crate) struct ManagedDeepgramStreamingState {
    active: Mutex<Option<StreamingSessionHandle>>,
}

impl ManagedDeepgramStreamingState {
    pub(crate) fn try_start(&self, handle: StreamingSessionHandle) -> Result<(), ProviderError> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| ProviderFailure::Request("streaming state lock failed".to_string()))?;
        if active.is_some() {
            return Err(ProviderFailure::InvalidRequest(
                "Deepgram streaming session is already active".to_string(),
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
                "no active Deepgram streaming session".to_string(),
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
                        "Deepgram streaming audio channel is full".to_string(),
                    )
                    .into());
                }
                return Err(ProviderFailure::Request(
                    "Deepgram streaming audio channel is closed".to_string(),
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
            let _ = audio_tx.try_send(StreamingClientMessage::FinalizeAndClose);
        }
        true
    }

    pub(crate) fn dropped_frames(&self) -> u64 {
        self.dropped_frames.load(Ordering::Relaxed)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeepgramStreamingSnapshot {
    pub(crate) session_id: String,
    pub(crate) model_id: String,
    pub(crate) final_text: Option<String>,
    pub(crate) partial_count: u64,
    pub(crate) bytes_sent: i64,
    pub(crate) frame_count: i64,
    pub(crate) dropped_frames: i64,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

impl DeepgramStreamingSnapshot {
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

    pub(crate) fn record_output(&mut self, output: &DeepgramStreamingOutput) {
        match output {
            DeepgramStreamingOutput::Partial { .. } => {
                self.partial_count += 1;
                self.provider_events.push(self.event(
                    "stream_partial_received",
                    "receive",
                    "succeeded",
                    None,
                ));
            }
            DeepgramStreamingOutput::Final { text, .. } => {
                self.final_text = Some(text.clone());
                self.provider_events.push(self.event(
                    "stream_final_received",
                    "receive",
                    "succeeded",
                    Some(json!({ "characterCount": text.chars().count() })),
                ));
            }
            DeepgramStreamingOutput::Terminated => {
                self.provider_events.push(self.event(
                    "stream_terminated",
                    "terminate",
                    "succeeded",
                    Some(json!({ "droppedFrames": self.dropped_frames })),
                ));
            }
            DeepgramStreamingOutput::Error { message } => {
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
            DeepgramStreamingOutput::Ignored => {}
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
    FinalizeAndClose,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum DeepgramStreamingOutput {
    Partial { sequence: u32, text: String },
    Final { sequence: u32, text: String },
    Terminated,
    Error { message: String },
    Ignored,
}

impl DeepgramStreamingOutput {
    #[cfg(test)]
    fn from_event(event: DeepgramStreamingEvent) -> Self {
        Self::from_event_with_sequence(event, 0, &mut HashSet::new())
    }

    fn from_event_with_sequence(
        event: DeepgramStreamingEvent,
        sequence: u32,
        final_keys: &mut HashSet<String>,
    ) -> Self {
        match event.event_type.as_deref() {
            Some("Results") => result_output(event, sequence, final_keys),
            Some("Metadata") => Self::Terminated,
            Some("Error") => Self::Error {
                message: format!("Deepgram streaming error: {}", event.error_message()),
            },
            Some("SpeechStarted" | "UtteranceEnd") => Self::Ignored,
            _ => Self::Ignored,
        }
    }
}

fn result_output(
    event: DeepgramStreamingEvent,
    sequence: u32,
    final_keys: &mut HashSet<String>,
) -> DeepgramStreamingOutput {
    let text = event
        .channel
        .as_ref()
        .and_then(|channel| channel.alternatives.first())
        .and_then(|alternative| alternative.transcript.as_deref())
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        return DeepgramStreamingOutput::Ignored;
    }

    if event.is_final.unwrap_or(false) {
        if let Some(key) = event.final_segment_key(&text) {
            if !final_keys.insert(key) {
                return DeepgramStreamingOutput::Ignored;
            }
        }
        DeepgramStreamingOutput::Final { sequence, text }
    } else {
        DeepgramStreamingOutput::Partial { sequence, text }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct DeepgramStreamingConfig {
    host: String,
    model: String,
    language_code: String,
    encoding: String,
    sample_rate_hz: u32,
    channel_count: u8,
    endpointing_ms: u32,
    profile: DeepgramStreamingProfile,
}

impl Default for DeepgramStreamingConfig {
    fn default() -> Self {
        let profile = DeepgramStreamingProfile::default();
        Self {
            host: DEFAULT_STREAMING_HOST.to_string(),
            model: DEFAULT_STREAMING_MODEL.to_string(),
            language_code: profile.language_code.to_string(),
            encoding: profile.provider_encoding.to_string(),
            sample_rate_hz: profile.sample_rate_hz,
            channel_count: profile.channel_count,
            endpointing_ms: profile.endpointing_ms,
            profile,
        }
    }
}

impl DeepgramStreamingConfig {
    pub(crate) fn with_model(model: Option<String>) -> Result<Self, ProviderError> {
        let mut config = Self::default();
        if let Some(model) = model
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            if model != DEFAULT_STREAMING_MODEL {
                return Err(ProviderFailure::InvalidRequest(
                    "Deepgram streaming supports nova-3 only".to_string(),
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
            "wss://{}/v1/listen?model={}&encoding={}&sample_rate={}&channels={}&language={}&smart_format=true&interim_results=true&endpointing={}",
            self.host,
            self.model,
            self.encoding,
            self.sample_rate_hz,
            self.channel_count,
            self.language_code,
            self.endpointing_ms
        );
        let mut request = url
            .into_client_request()
            .map_err(|error| ProviderFailure::Request(error.to_string()))?;
        request.headers_mut().insert(
            "authorization",
            HeaderValue::from_str(&format!("Token {api_key}"))
                .map_err(|error| ProviderFailure::Request(error.to_string()))?,
        );
        Ok(request)
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub(crate) struct DeepgramStreamingEvent {
    #[serde(rename = "type")]
    pub(crate) event_type: Option<String>,
    pub(crate) channel_index: Option<Vec<u32>>,
    pub(crate) duration: Option<f64>,
    pub(crate) start: Option<f64>,
    pub(crate) is_final: Option<bool>,
    pub(crate) speech_final: Option<bool>,
    pub(crate) from_finalize: Option<bool>,
    pub(crate) channel: Option<DeepgramChannel>,
    pub(crate) message: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) reason: Option<String>,
}

impl DeepgramStreamingEvent {
    fn final_segment_key(&self, text: &str) -> Option<String> {
        let (Some(start), Some(duration)) = (self.start, self.duration) else {
            return None;
        };

        Some(format!(
            "{:?}|{:?}|{:?}|{}",
            self.channel_index,
            normalize_seconds(start),
            normalize_seconds(duration),
            text
        ))
    }

    fn error_message(&self) -> String {
        self.message
            .clone()
            .or_else(|| self.error.clone())
            .or_else(|| self.reason.clone())
            .unwrap_or_else(|| "provider returned an error".to_string())
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub(crate) struct DeepgramChannel {
    pub(crate) alternatives: Vec<DeepgramAlternative>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub(crate) struct DeepgramAlternative {
    pub(crate) transcript: Option<String>,
}

pub(crate) fn parse_streaming_event(
    payload: &str,
) -> Result<DeepgramStreamingEvent, ProviderError> {
    serde_json::from_str(payload).map_err(|_| ProviderFailure::InvalidResponse.into())
}

fn finalize_message_json() -> String {
    r#"{"type":"Finalize"}"#.to_string()
}

fn close_stream_message_json() -> String {
    r#"{"type":"CloseStream"}"#.to_string()
}

fn keepalive_message_json() -> String {
    r#"{"type":"KeepAlive"}"#.to_string()
}

fn normalize_seconds(seconds: f64) -> i64 {
    (seconds * 1_000.0).round() as i64
}

fn current_utc_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[test]
    fn streaming_config_builds_deepgram_websocket_request_with_token_auth() {
        let config =
            DeepgramStreamingConfig::with_model(Some("nova-3".to_string())).expect("config");

        let request = config
            .build_request("deepgram-test-key")
            .expect("request to build");

        assert_eq!(
            request.uri().to_string(),
            "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&language=en-US&smart_format=true&interim_results=true&endpointing=300"
        );
        assert_eq!(
            request
                .headers()
                .get("authorization")
                .and_then(|value| value.to_str().ok()),
            Some("Token deepgram-test-key")
        );
    }

    #[test]
    fn deepgram_streaming_profile_matches_provider_audio_requirements() {
        let profile = DeepgramStreamingProfile::default();

        assert_eq!(profile.provider_id, "deepgram");
        assert_eq!(profile.sample_rate_hz, 16_000);
        assert_eq!(profile.channel_count, 1);
        assert_eq!(profile.sample_format, "pcm_s16le");
        assert_eq!(profile.bytes_per_frame, 3_200);
        assert_eq!(profile.provider_encoding, "linear16");
        assert_eq!(profile.transport_encoding, "websocket_binary");
        assert_eq!(profile.language_code, "en-US");
        assert_eq!(profile.endpointing_ms, 300);
    }

    #[test]
    fn rejects_empty_api_key_before_connect() {
        let err = DeepgramStreamingConfig::default()
            .build_request("  ")
            .expect_err("empty key should fail");

        assert_eq!(err.code, "missing_provider_key");
    }

    #[test]
    fn rejects_non_nova_streaming_model() {
        let err = DeepgramStreamingConfig::with_model(Some("flux-general-en".to_string()))
            .expect_err("voice-agent model should not be accepted");

        assert_eq!(err.code, "invalid_provider_request");
        assert!(err
            .message
            .contains("Deepgram streaming supports nova-3 only"));
    }

    #[test]
    fn parses_partial_final_metadata_and_optional_vad_messages() {
        let partial = DeepgramStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"Results","is_final":false,"channel":{"alternatives":[{"transcript":"draft"}]}}"#,
            )
            .expect("partial event"),
        );
        let final_output = DeepgramStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"Results","is_final":true,"speech_final":true,"channel_index":[0,1],"start":1.2,"duration":0.4,"channel":{"alternatives":[{"transcript":"final text"}]}}"#,
            )
            .expect("final event"),
        );
        let metadata = DeepgramStreamingOutput::from_event(
            parse_streaming_event(r#"{"type":"Metadata","request_id":"req-1"}"#)
                .expect("metadata event"),
        );
        let speech_started = DeepgramStreamingOutput::from_event(
            parse_streaming_event(r#"{"type":"SpeechStarted","timestamp":1.0}"#)
                .expect("speech event"),
        );
        let utterance_end = DeepgramStreamingOutput::from_event(
            parse_streaming_event(r#"{"type":"UtteranceEnd","last_word_end":1.5}"#)
                .expect("utterance event"),
        );

        assert_eq!(
            partial,
            DeepgramStreamingOutput::Partial {
                sequence: 0,
                text: "draft".to_string(),
            }
        );
        assert_eq!(
            final_output,
            DeepgramStreamingOutput::Final {
                sequence: 0,
                text: "final text".to_string(),
            }
        );
        assert_eq!(metadata, DeepgramStreamingOutput::Terminated);
        assert_eq!(speech_started, DeepgramStreamingOutput::Ignored);
        assert_eq!(utterance_end, DeepgramStreamingOutput::Ignored);
    }

    #[test]
    fn duplicate_final_segments_are_ignored() {
        let event = parse_streaming_event(
            r#"{"type":"Results","is_final":true,"channel_index":[0,1],"start":1.2,"duration":0.4,"channel":{"alternatives":[{"transcript":"final text"}]}}"#,
        )
        .expect("final event");
        let mut final_keys = HashSet::new();

        let first =
            DeepgramStreamingOutput::from_event_with_sequence(event.clone(), 0, &mut final_keys);
        let duplicate =
            DeepgramStreamingOutput::from_event_with_sequence(event, 1, &mut final_keys);

        assert!(matches!(first, DeepgramStreamingOutput::Final { .. }));
        assert_eq!(duplicate, DeepgramStreamingOutput::Ignored);
    }

    #[test]
    fn repeated_final_text_without_timing_is_not_deduplicated() {
        let event = parse_streaming_event(
            r#"{"type":"Results","is_final":true,"channel":{"alternatives":[{"transcript":"yes"}]}}"#,
        )
        .expect("final event");
        let mut final_keys = HashSet::new();

        let first =
            DeepgramStreamingOutput::from_event_with_sequence(event.clone(), 0, &mut final_keys);
        let repeated = DeepgramStreamingOutput::from_event_with_sequence(event, 1, &mut final_keys);

        assert_eq!(
            first,
            DeepgramStreamingOutput::Final {
                sequence: 0,
                text: "yes".to_string(),
            }
        );
        assert_eq!(
            repeated,
            DeepgramStreamingOutput::Final {
                sequence: 1,
                text: "yes".to_string(),
            }
        );
    }

    #[test]
    fn malformed_streaming_payload_becomes_invalid_response() {
        let err = parse_streaming_event("not-json").expect_err("invalid json should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }

    #[test]
    fn provider_error_message_becomes_streaming_error() {
        let output = DeepgramStreamingOutput::from_event(
            parse_streaming_event(r#"{"type":"Error","message":"bad audio"}"#)
                .expect("error event"),
        );

        assert_eq!(
            output,
            DeepgramStreamingOutput::Error {
                message: "Deepgram streaming error: bad audio".to_string(),
            }
        );
    }

    #[test]
    fn control_messages_use_deepgram_text_frame_shapes() {
        assert_eq!(finalize_message_json(), r#"{"type":"Finalize"}"#);
        assert_eq!(close_stream_message_json(), r#"{"type":"CloseStream"}"#);
        assert_eq!(keepalive_message_json(), r#"{"type":"KeepAlive"}"#);
    }

    #[test]
    fn streaming_handle_flushes_3200_byte_partial_frame_before_finalize_and_close() {
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
            StreamingClientMessage::FinalizeAndClose => panic!("close arrived before audio flush"),
        }
        assert!(matches!(
            audio_rx.try_recv().expect("control message"),
            StreamingClientMessage::FinalizeAndClose,
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
            .contains("Deepgram streaming audio channel is full"));
        assert_eq!(handle.dropped_frames(), 1);
        assert!(matches!(
            audio_rx.try_recv().expect("queued message"),
            StreamingClientMessage::Audio(_),
        ));
    }
}

#![allow(dead_code)]

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
pub(crate) use crate::providers::speech::streaming_common::StreamingAudioWrite;
use crate::providers::speech::streaming_common::{Pcm16FrameChunker, StreamingSessionState};
use crate::providers::ProviderTimelineEvent;

const DEFAULT_STREAMING_HOST: &str = "streaming.assemblyai.com";
const DEFAULT_STREAMING_MODEL: &str = "u3-rt-pro";
const DEFAULT_STREAMING_MODE: &str = "max_accuracy";
const DEFAULT_STREAMING_LANGUAGE_CODE: &str = "en";
const DEFAULT_SAMPLE_RATE_HZ: u32 = 16_000;
const DEFAULT_FRAME_MS: u32 = 50;
const AUDIO_CHANNEL_CAPACITY: usize = 64;
const EVENT_CHANNEL_CAPACITY: usize = 64;
const PROVIDER_ID: &str = "assemblyai";
const PROVIDER_MODE: &str = "streaming";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AssemblyAiStreamingProfile {
    pub(crate) provider_id: &'static str,
    pub(crate) sample_rate_hz: u32,
    pub(crate) channel_count: u8,
    pub(crate) sample_format: &'static str,
    pub(crate) frame_ms: u32,
    pub(crate) bytes_per_frame: usize,
    pub(crate) transport_encoding: &'static str,
    pub(crate) accuracy_mode: &'static str,
    pub(crate) language_code: &'static str,
}

impl Default for AssemblyAiStreamingProfile {
    fn default() -> Self {
        Self {
            provider_id: PROVIDER_ID,
            sample_rate_hz: DEFAULT_SAMPLE_RATE_HZ,
            channel_count: 1,
            sample_format: "pcm_s16le",
            frame_ms: DEFAULT_FRAME_MS,
            bytes_per_frame: 1_600,
            transport_encoding: "websocket_binary",
            accuracy_mode: DEFAULT_STREAMING_MODE,
            language_code: DEFAULT_STREAMING_LANGUAGE_CODE,
        }
    }
}

#[derive(Debug)]
pub(crate) struct AssemblyAiStreamingSession {
    audio_tx: mpsc::Sender<StreamingClientMessage>,
    events_rx: mpsc::Receiver<AssemblyAiStreamingOutput>,
    chunker: Pcm16FrameChunker,
    state: Arc<StreamingSessionState>,
    dropped_frames: Arc<AtomicU64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssemblyAiStreamingStartResult {
    pub(crate) provider_id: String,
    pub(crate) model_id: String,
    pub(crate) provider_mode: String,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssemblyAiStreamingCommandEvent {
    pub(crate) event_type: String,
    pub(crate) session_id: Option<String>,
    pub(crate) turn_order: Option<u32>,
    pub(crate) text: Option<String>,
    pub(crate) audio_duration_ms: Option<u64>,
    pub(crate) session_duration_ms: Option<u64>,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

pub(crate) async fn start_managed_session(
    api_key: &str,
    state: Arc<ManagedAssemblyAiStreamingState>,
    events: tauri::ipc::Channel<AssemblyAiStreamingCommandEvent>,
    model: Option<String>,
    prompt: Option<String>,
) -> Result<AssemblyAiStreamingStartResult, ProviderError> {
    let config = AssemblyAiStreamingConfig::with_model(model)?.with_prompt(prompt);
    let model_id = config.speech_model.clone();
    let session = AssemblyAiStreamingSession::connect_with_config(api_key, config).await?;
    let snapshot = AssemblyAiStreamingSnapshot::new("pending".to_string(), model_id.clone());
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

    Ok(AssemblyAiStreamingStartResult {
        provider_id: PROVIDER_ID.to_string(),
        model_id,
        provider_mode: PROVIDER_MODE.to_string(),
        provider_events: started_events,
    })
}

fn command_event_from_output(
    snapshot: &mut AssemblyAiStreamingSnapshot,
    output: AssemblyAiStreamingOutput,
) -> AssemblyAiStreamingCommandEvent {
    snapshot.record_output(&output);
    let provider_events = snapshot
        .provider_events
        .last()
        .cloned()
        .into_iter()
        .collect::<Vec<_>>();
    match output {
        AssemblyAiStreamingOutput::Began { session_id, .. } => AssemblyAiStreamingCommandEvent {
            event_type: "began".to_string(),
            session_id: Some(session_id),
            turn_order: None,
            text: None,
            audio_duration_ms: None,
            session_duration_ms: None,
            provider_events,
        },
        AssemblyAiStreamingOutput::Partial { turn_order, text } => {
            AssemblyAiStreamingCommandEvent {
                event_type: "partial".to_string(),
                session_id: Some(snapshot.session_id.clone()),
                turn_order: Some(turn_order),
                text: Some(text),
                audio_duration_ms: None,
                session_duration_ms: None,
                provider_events,
            }
        }
        AssemblyAiStreamingOutput::Final { turn_order, text } => AssemblyAiStreamingCommandEvent {
            event_type: "final".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            turn_order: Some(turn_order),
            text: Some(text),
            audio_duration_ms: None,
            session_duration_ms: None,
            provider_events,
        },
        AssemblyAiStreamingOutput::Terminated {
            audio_duration_ms,
            session_duration_ms,
        } => AssemblyAiStreamingCommandEvent {
            event_type: "terminated".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            turn_order: None,
            text: None,
            audio_duration_ms: Some(audio_duration_ms),
            session_duration_ms: Some(session_duration_ms),
            provider_events,
        },
        AssemblyAiStreamingOutput::Error { .. } => AssemblyAiStreamingCommandEvent {
            event_type: "error".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            turn_order: None,
            text: None,
            audio_duration_ms: None,
            session_duration_ms: None,
            provider_events,
        },
        AssemblyAiStreamingOutput::Ignored => AssemblyAiStreamingCommandEvent {
            event_type: "ignored".to_string(),
            session_id: Some(snapshot.session_id.clone()),
            turn_order: None,
            text: None,
            audio_duration_ms: None,
            session_duration_ms: None,
            provider_events: Vec::new(),
        },
    }
}

impl AssemblyAiStreamingSession {
    pub(crate) async fn connect(api_key: &str) -> Result<Self, ProviderError> {
        Self::connect_with_config(api_key, AssemblyAiStreamingConfig::default()).await
    }

    pub(crate) async fn connect_with_config(
        api_key: &str,
        config: AssemblyAiStreamingConfig,
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

        let reader_config = config.clone();
        tokio::spawn(async move {
            while let Some(message) = audio_rx.recv().await {
                match message {
                    StreamingClientMessage::Audio(frame) => {
                        if writer.send(Message::Binary(frame.into())).await.is_err() {
                            break;
                        }
                    }
                    StreamingClientMessage::Terminate => {
                        let _ = writer
                            .send(Message::Text(terminate_message_json().into()))
                            .await;
                        continue;
                    }
                }
            }
            writer_state.request_stop();
        });

        tokio::spawn(async move {
            while let Some(message) = reader.next().await {
                let Ok(message) = message else {
                    let _ = events_tx
                        .send(AssemblyAiStreamingOutput::Error {
                            message: "AssemblyAI streaming websocket read failed".to_string(),
                        })
                        .await;
                    reader_state.request_stop();
                    break;
                };

                if let Ok(text) = message.to_text() {
                    match parse_streaming_event(text) {
                        Ok(event) => {
                            let output = AssemblyAiStreamingOutput::from_event_with_config(
                                event,
                                &reader_config,
                            );
                            let should_stop =
                                matches!(output, AssemblyAiStreamingOutput::Terminated { .. });
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
                                .send(AssemblyAiStreamingOutput::Error {
                                    message: "AssemblyAI streaming event was invalid".to_string(),
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
            chunker: Pcm16FrameChunker::for_pcm16(DEFAULT_SAMPLE_RATE_HZ, DEFAULT_FRAME_MS)?,
            state,
            dropped_frames: Arc::new(AtomicU64::new(0)),
        })
    }

    pub(crate) fn send_pcm16(
        &mut self,
        bytes: &[u8],
    ) -> Result<StreamingAudioWrite, ProviderError> {
        let frames = self.chunker.push(bytes);
        let frame_count = frames.len();
        let bytes_sent = frames.iter().map(Vec::len).sum::<usize>();
        for frame in frames {
            if let Err(error) = self.audio_tx.try_send(StreamingClientMessage::Audio(frame)) {
                if matches!(error, TrySendError::Full(_)) {
                    self.dropped_frames.fetch_add(1, Ordering::Relaxed);
                    return Err(ProviderFailure::Request(
                        "AssemblyAI streaming audio channel is full".to_string(),
                    )
                    .into());
                }
                return Err(ProviderFailure::Request(
                    "AssemblyAI streaming audio channel is closed".to_string(),
                )
                .into());
            }
        }
        Ok(StreamingAudioWrite {
            bytes_sent,
            frame_count,
            dropped_frames: self.dropped_frame_count(),
        })
    }

    pub(crate) fn request_stop(&mut self) {
        if self.state.request_stop() {
            if let Some(frame) = self.chunker.flush_padded_frame() {
                if let Err(error) = self.audio_tx.try_send(StreamingClientMessage::Audio(frame)) {
                    if matches!(error, TrySendError::Full(_)) {
                        self.dropped_frames.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }
            let _ = self.audio_tx.try_send(StreamingClientMessage::Terminate);
        }
    }

    pub(crate) async fn next_event(&mut self) -> Option<AssemblyAiStreamingOutput> {
        self.events_rx.recv().await
    }

    pub(crate) fn dropped_frame_count(&self) -> u64 {
        self.dropped_frames.load(Ordering::Relaxed)
    }

    fn into_handle_and_events(
        self,
        session_id: String,
    ) -> (
        StreamingSessionHandle,
        mpsc::Receiver<AssemblyAiStreamingOutput>,
    ) {
        (
            StreamingSessionHandle {
                session_id,
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
pub(crate) struct ManagedAssemblyAiStreamingState {
    active: Mutex<Option<StreamingSessionHandle>>,
}

impl ManagedAssemblyAiStreamingState {
    pub(crate) fn try_start(&self, handle: StreamingSessionHandle) -> Result<(), ProviderError> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| ProviderFailure::Request("streaming state lock failed".to_string()))?;
        if active.is_some() {
            return Err(ProviderFailure::InvalidRequest(
                "AssemblyAI streaming session is already active".to_string(),
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
                "no active AssemblyAI streaming session".to_string(),
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
    session_id: String,
    audio_tx: Option<mpsc::Sender<StreamingClientMessage>>,
    chunker: Pcm16FrameChunker,
    stop_state: Arc<StreamingSessionState>,
    dropped_frames: Arc<AtomicU64>,
}

impl StreamingSessionHandle {
    #[cfg(test)]
    fn test(session_id: &str) -> Self {
        Self {
            session_id: session_id.to_string(),
            audio_tx: None,
            chunker: Pcm16FrameChunker::for_pcm16(DEFAULT_SAMPLE_RATE_HZ, DEFAULT_FRAME_MS)
                .expect("test frame config"),
            stop_state: Arc::new(StreamingSessionState::default()),
            dropped_frames: Arc::new(AtomicU64::new(0)),
        }
    }

    #[cfg(test)]
    fn test_with_sender(session_id: &str, audio_tx: mpsc::Sender<StreamingClientMessage>) -> Self {
        Self {
            session_id: session_id.to_string(),
            audio_tx: Some(audio_tx),
            chunker: Pcm16FrameChunker::for_pcm16(DEFAULT_SAMPLE_RATE_HZ, DEFAULT_FRAME_MS)
                .expect("test frame config"),
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
                        "AssemblyAI streaming audio channel is full".to_string(),
                    )
                    .into());
                }
                return Err(ProviderFailure::Request(
                    "AssemblyAI streaming audio channel is closed".to_string(),
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
            let _ = audio_tx.try_send(StreamingClientMessage::Terminate);
        }
        true
    }

    pub(crate) fn session_id(&self) -> &str {
        &self.session_id
    }

    pub(crate) fn dropped_frames(&self) -> u64 {
        self.dropped_frames.load(Ordering::Relaxed)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssemblyAiStreamingSnapshot {
    pub(crate) session_id: String,
    pub(crate) model_id: String,
    pub(crate) final_text: Option<String>,
    pub(crate) partial_count: u64,
    pub(crate) bytes_sent: i64,
    pub(crate) frame_count: i64,
    pub(crate) dropped_frames: i64,
    pub(crate) provider_events: Vec<ProviderTimelineEvent>,
}

impl AssemblyAiStreamingSnapshot {
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
            None,
        ));
        snapshot
    }

    pub(crate) fn record_sent_audio(&mut self, bytes_sent: usize, frame_count: usize) {
        self.bytes_sent = self
            .bytes_sent
            .saturating_add(i64::try_from(bytes_sent).unwrap_or(i64::MAX));
        self.frame_count = self
            .frame_count
            .saturating_add(i64::try_from(frame_count).unwrap_or(i64::MAX));
    }

    pub(crate) fn record_output(&mut self, output: &AssemblyAiStreamingOutput) {
        match output {
            AssemblyAiStreamingOutput::Began {
                session_id,
                applied_model,
                ..
            } => {
                self.session_id = session_id.clone();
                if let Some(applied_model) = applied_model {
                    self.model_id = applied_model.clone();
                }
                self.provider_events.push(self.event(
                    "stream_session_began",
                    "begin",
                    "succeeded",
                    None,
                    None,
                ));
            }
            AssemblyAiStreamingOutput::Partial { .. } => {
                self.partial_count = self.partial_count.saturating_add(1);
                self.provider_events.push(self.event(
                    "stream_partial_received",
                    "receive_partial",
                    "succeeded",
                    None,
                    None,
                ));
            }
            AssemblyAiStreamingOutput::Final { text, .. } => {
                self.final_text = Some(text.clone());
                self.provider_events.push(self.event(
                    "stream_final_received",
                    "receive_final",
                    "succeeded",
                    None,
                    Some(json!({ "characterCount": text.chars().count() })),
                ));
            }
            AssemblyAiStreamingOutput::Terminated {
                audio_duration_ms,
                session_duration_ms,
            } => {
                self.provider_events.push(self.event(
                    "stream_terminated",
                    "terminate",
                    "succeeded",
                    Some(i64::try_from(*session_duration_ms).unwrap_or(i64::MAX)),
                    Some(json!({
                        "audioDurationMs": audio_duration_ms,
                        "droppedFrames": self.dropped_frames,
                        "partialCount": self.partial_count,
                        "sessionDurationMs": session_duration_ms,
                    })),
                ));
            }
            AssemblyAiStreamingOutput::Error { .. } => {
                self.provider_events.push(self.event(
                    "stream_error",
                    "receive",
                    "failed",
                    None,
                    None,
                ));
            }
            AssemblyAiStreamingOutput::Ignored => {}
        }
    }

    fn event(
        &self,
        event_type: &str,
        stage: &str,
        status: &str,
        duration_ms: Option<i64>,
        metadata: Option<serde_json::Value>,
    ) -> ProviderTimelineEvent {
        ProviderTimelineEvent {
            event_type: event_type.to_string(),
            provider_id: PROVIDER_ID.to_string(),
            model_id: Some(self.model_id.clone()),
            provider_mode: PROVIDER_MODE.to_string(),
            session_id: Some(self.session_id.clone()),
            stage: Some(stage.to_string()),
            started_at: Some(current_utc_timestamp()),
            completed_at: Some(current_utc_timestamp()),
            duration_ms,
            status: Some(status.to_string()),
            error_code: if status == "failed" {
                Some("provider_request_failed".to_string())
            } else {
                None
            },
            bytes_sent: if self.bytes_sent > 0 {
                Some(self.bytes_sent)
            } else {
                None
            },
            frame_count: if self.frame_count > 0 {
                Some(self.frame_count)
            } else {
                None
            },
            metadata,
        }
    }
}

#[derive(Debug)]
enum StreamingClientMessage {
    Audio(Vec<u8>),
    Terminate,
}

impl StreamingClientMessage {
    #[cfg(test)]
    fn closes_writer_loop(&self) -> bool {
        false
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum AssemblyAiStreamingOutput {
    Began {
        session_id: String,
        expires_at: i64,
        applied_model: Option<String>,
        applied_mode: Option<String>,
    },
    Partial {
        turn_order: u32,
        text: String,
    },
    Final {
        turn_order: u32,
        text: String,
    },
    Terminated {
        audio_duration_ms: u64,
        session_duration_ms: u64,
    },
    Error {
        message: String,
    },
    Ignored,
}

impl AssemblyAiStreamingOutput {
    fn from_event(event: AssemblyAiStreamingEvent) -> Self {
        Self::from_event_with_config(event, &AssemblyAiStreamingConfig::default())
    }

    fn from_event_with_config(
        event: AssemblyAiStreamingEvent,
        config: &AssemblyAiStreamingConfig,
    ) -> Self {
        match event {
            AssemblyAiStreamingEvent::Begin {
                id,
                expires_at,
                configuration,
            } => {
                if let Some(applied_model) = configuration
                    .as_ref()
                    .and_then(|value| value.model.as_deref())
                {
                    if applied_model != config.speech_model {
                        return Self::Error {
                            message: format!(
                                "AssemblyAI streaming applied model {applied_model} instead of requested {}",
                                config.speech_model
                            ),
                        };
                    }
                }
                if let Some(applied_mode) = configuration
                    .as_ref()
                    .and_then(|value| value.mode.as_deref())
                {
                    if applied_mode != config.mode {
                        return Self::Error {
                            message: format!(
                                "AssemblyAI streaming applied mode {applied_mode} instead of requested {}",
                                config.mode
                            ),
                        };
                    }
                }

                Self::Began {
                    session_id: id,
                    expires_at,
                    applied_model: configuration.as_ref().and_then(|value| value.model.clone()),
                    applied_mode: configuration.and_then(|value| value.mode),
                }
            }
            AssemblyAiStreamingEvent::Turn {
                turn_order,
                end_of_turn,
                transcript,
                ..
            } if end_of_turn && !transcript.trim().is_empty() => Self::Final {
                turn_order,
                text: transcript,
            },
            AssemblyAiStreamingEvent::Turn {
                turn_order,
                transcript,
                ..
            } if !transcript.trim().is_empty() => Self::Partial {
                turn_order,
                text: transcript,
            },
            AssemblyAiStreamingEvent::Termination {
                audio_duration_seconds,
                session_duration_seconds,
            } => Self::Terminated {
                audio_duration_ms: audio_duration_seconds.saturating_mul(1_000),
                session_duration_ms: session_duration_seconds.saturating_mul(1_000),
            },
            AssemblyAiStreamingEvent::Error { error_code, error } => Self::Error {
                message: format!("AssemblyAI streaming error {error_code}: {error}"),
            },
            _ => Self::Ignored,
        }
    }
}

fn terminate_message_json() -> String {
    json!({ "type": "Terminate" }).to_string()
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AssemblyAiStreamingConfig {
    host: String,
    speech_model: String,
    sample_rate_hz: u32,
    mode: String,
    language_code: String,
    prompt: Option<String>,
}

impl Default for AssemblyAiStreamingConfig {
    fn default() -> Self {
        Self {
            host: DEFAULT_STREAMING_HOST.to_string(),
            speech_model: DEFAULT_STREAMING_MODEL.to_string(),
            sample_rate_hz: DEFAULT_SAMPLE_RATE_HZ,
            mode: DEFAULT_STREAMING_MODE.to_string(),
            language_code: DEFAULT_STREAMING_LANGUAGE_CODE.to_string(),
            prompt: None,
        }
    }
}

impl AssemblyAiStreamingConfig {
    pub(crate) fn with_model(model: Option<String>) -> Result<Self, ProviderError> {
        let mut config = Self::default();
        if let Some(model) = model
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            config.speech_model = model;
        }
        Ok(config)
    }

    pub(crate) fn with_prompt(mut self, prompt: Option<String>) -> Self {
        self.prompt = prompt.filter(|value| !value.trim().is_empty());
        self
    }

    pub(crate) fn build_request(&self, api_key: &str) -> Result<Request, ProviderError> {
        if api_key.trim().is_empty() {
            return Err(ProviderFailure::MissingCredential.into());
        }

        let mut url = reqwest::Url::parse(&format!("wss://{}/v3/ws", self.host))
            .map_err(|error| ProviderFailure::Request(error.to_string()))?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("speech_model", &self.speech_model);
            query.append_pair("sample_rate", &self.sample_rate_hz.to_string());
            query.append_pair("mode", &self.mode);
            query.append_pair("language_code", &self.language_code);
            if let Some(prompt) = &self.prompt {
                query.append_pair("prompt", prompt);
            }
        }
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|error| ProviderFailure::Request(error.to_string()))?;
        request.headers_mut().insert(
            "authorization",
            HeaderValue::from_str(api_key)
                .map_err(|error| ProviderFailure::Request(error.to_string()))?,
        );
        Ok(request)
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub(crate) struct AssemblyAiAppliedConfiguration {
    pub(crate) model: Option<String>,
    pub(crate) mode: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub(crate) enum AssemblyAiStreamingEvent {
    Begin {
        id: String,
        expires_at: i64,
        #[serde(default)]
        configuration: Option<AssemblyAiAppliedConfiguration>,
    },
    Turn {
        turn_order: u32,
        end_of_turn: bool,
        turn_is_formatted: bool,
        transcript: String,
        #[serde(default)]
        utterance: String,
    },
    Termination {
        audio_duration_seconds: u64,
        session_duration_seconds: u64,
    },
    Error {
        error_code: u32,
        error: String,
    },
    #[serde(other)]
    Unknown,
}

impl AssemblyAiStreamingEvent {
    pub(crate) fn committed_text(&self) -> Option<&str> {
        match self {
            Self::Turn {
                end_of_turn: true,
                transcript,
                ..
            } => Some(transcript.as_str()).filter(|value| !value.trim().is_empty()),
            _ => None,
        }
    }

    pub(crate) fn audio_duration_ms(&self) -> Option<u64> {
        match self {
            Self::Termination {
                audio_duration_seconds,
                ..
            } => audio_duration_seconds.checked_mul(1_000),
            _ => None,
        }
    }

    pub(crate) fn session_duration_ms(&self) -> Option<u64> {
        match self {
            Self::Termination {
                session_duration_seconds,
                ..
            } => session_duration_seconds.checked_mul(1_000),
            _ => None,
        }
    }

    pub(crate) fn applied_model(&self) -> Option<&str> {
        match self {
            Self::Begin { configuration, .. } => configuration
                .as_ref()
                .and_then(|value| value.model.as_deref()),
            _ => None,
        }
    }

    pub(crate) fn applied_mode(&self) -> Option<&str> {
        match self {
            Self::Begin { configuration, .. } => configuration
                .as_ref()
                .and_then(|value| value.mode.as_deref()),
            _ => None,
        }
    }
}

pub(crate) fn parse_streaming_event(
    payload: &str,
) -> Result<AssemblyAiStreamingEvent, ProviderError> {
    serde_json::from_str(payload).map_err(|_| ProviderFailure::InvalidResponse.into())
}

fn current_utc_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn streaming_config_builds_accuracy_oriented_websocket_request_without_bearer_prefix() {
        let config = AssemblyAiStreamingConfig::default();

        let request = config
            .build_request("assembly-test-key")
            .expect("request to build");

        assert_eq!(
            request.uri().to_string(),
            "wss://streaming.assemblyai.com/v3/ws?speech_model=u3-rt-pro&sample_rate=16000&mode=max_accuracy&language_code=en"
        );
        assert_eq!(
            request
                .headers()
                .get("authorization")
                .and_then(|value| value.to_str().ok()),
            Some("assembly-test-key")
        );
    }

    #[test]
    fn streaming_config_sends_a_url_encoded_instruction_prompt() {
        let config = AssemblyAiStreamingConfig::with_model(Some("u3-rt-pro".to_string()))
            .expect("config")
            .with_prompt(Some("Keep Acme, Inc. exact.".to_string()));

        let request = config.build_request("assembly-test-key").expect("request");

        assert!(request
            .uri()
            .to_string()
            .contains("prompt=Keep+Acme%2C+Inc.+exact."));
    }

    #[test]
    fn assemblyai_streaming_profile_matches_provider_audio_requirements() {
        let profile = AssemblyAiStreamingProfile::default();

        assert_eq!(profile.provider_id, "assemblyai");
        assert_eq!(profile.sample_rate_hz, 16_000);
        assert_eq!(profile.channel_count, 1);
        assert_eq!(profile.sample_format, "pcm_s16le");
        assert_eq!(profile.frame_ms, 50);
        assert_eq!(profile.bytes_per_frame, 1_600);
        assert_eq!(profile.transport_encoding, "websocket_binary");
        assert_eq!(profile.accuracy_mode, "max_accuracy");
        assert_eq!(profile.language_code, "en");
    }

    #[test]
    fn parses_begin_configuration_echo_from_provider() {
        let event = parse_streaming_event(
            r#"{"type":"Begin","id":"session-1","expires_at":1772570132,"configuration":{"model":"universal-3-5-pro","mode":"max_accuracy","api_version":"1.0.0"}}"#,
        )
        .expect("begin event");

        assert_eq!(event.applied_model(), Some("universal-3-5-pro"));
        assert_eq!(event.applied_mode(), Some("max_accuracy"));
    }

    #[test]
    fn pcm16_frame_chunker_emits_fifty_ms_frames_and_keeps_remainder() {
        let mut chunker = Pcm16FrameChunker::for_pcm16(16_000, 50).expect("valid frame config");
        let audio = vec![7; 3_200 + 10];

        let frames = chunker.push(&audio);

        assert_eq!(frames.len(), 2);
        assert!(frames.iter().all(|frame| frame.len() == 1_600));
        assert_eq!(chunker.pending_len(), 10);
    }

    #[test]
    fn pcm16_frame_chunker_flushes_partial_trailing_audio_with_silence_padding() {
        let mut chunker = Pcm16FrameChunker::for_pcm16(16_000, 50).expect("valid frame config");
        assert!(chunker.push(&[7; 10]).is_empty());

        let frame = chunker.flush_padded_frame().expect("padded frame");

        assert_eq!(frame.len(), 1_600);
        assert_eq!(&frame[..10], &[7; 10]);
        assert!(frame[10..].iter().all(|byte| *byte == 0));
        assert_eq!(chunker.pending_len(), 0);
        assert!(chunker.flush_padded_frame().is_none());
    }

    #[test]
    fn parses_final_turn_without_using_partial_as_committed_text() {
        let partial = parse_streaming_event(
            r#"{"type":"Turn","turn_order":0,"end_of_turn":false,"turn_is_formatted":false,"transcript":"hello","utterance":""}"#,
        )
        .expect("partial turn");
        let final_turn = parse_streaming_event(
            r#"{"type":"Turn","turn_order":0,"end_of_turn":true,"turn_is_formatted":false,"transcript":"hello world","utterance":"hello world"}"#,
        )
        .expect("final turn");

        assert_eq!(partial.committed_text(), None);
        assert_eq!(final_turn.committed_text(), Some("hello world"));
    }

    #[test]
    fn parses_termination_duration_metrics() {
        let event = parse_streaming_event(
            r#"{"type":"Termination","audio_duration_seconds":7,"session_duration_seconds":12}"#,
        )
        .expect("termination event");

        assert_eq!(event.audio_duration_ms(), Some(7_000));
        assert_eq!(event.session_duration_ms(), Some(12_000));
    }

    #[test]
    fn session_stop_state_is_idempotent() {
        let state = StreamingSessionState::default();

        assert!(state.request_stop());
        assert!(!state.request_stop());
        assert!(state.is_stopping());
    }

    #[test]
    fn terminate_message_uses_assemblyai_control_shape() {
        assert_eq!(terminate_message_json(), r#"{"type":"Terminate"}"#);
    }

    #[test]
    fn terminate_message_keeps_socket_open_for_provider_final_events() {
        assert!(!StreamingClientMessage::Terminate.closes_writer_loop());
    }

    #[test]
    fn converts_turn_events_to_partial_and_final_outputs() {
        let partial = AssemblyAiStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"Turn","turn_order":2,"end_of_turn":false,"turn_is_formatted":false,"transcript":"draft","utterance":""}"#,
            )
            .expect("partial turn"),
        );
        let final_output = AssemblyAiStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"Turn","turn_order":2,"end_of_turn":true,"turn_is_formatted":false,"transcript":"final text","utterance":"final text"}"#,
            )
            .expect("final turn"),
        );

        assert_eq!(
            partial,
            AssemblyAiStreamingOutput::Partial {
                turn_order: 2,
                text: "draft".to_string()
            }
        );
        assert_eq!(
            final_output,
            AssemblyAiStreamingOutput::Final {
                turn_order: 2,
                text: "final text".to_string()
            }
        );
    }

    #[test]
    fn treats_applied_model_mismatch_as_streaming_error() {
        let event = parse_streaming_event(
            r#"{"type":"Begin","id":"session-1","expires_at":1772570132,"configuration":{"model":"universal-streaming-english","mode":"max_accuracy","api_version":"1.0.0"}}"#,
        )
        .expect("begin event");

        let output = AssemblyAiStreamingOutput::from_event_with_config(
            event,
            &AssemblyAiStreamingConfig::with_model(Some("u3-rt-pro".to_string())).expect("config"),
        );

        assert_eq!(
            output,
            AssemblyAiStreamingOutput::Error {
                message: "AssemblyAI streaming applied model universal-streaming-english instead of requested u3-rt-pro".to_string(),
            }
        );
    }

    #[test]
    fn treats_applied_mode_mismatch_as_streaming_error() {
        let event = parse_streaming_event(
            r#"{"type":"Begin","id":"session-1","expires_at":1772570132,"configuration":{"model":"u3-rt-pro","mode":"balanced","api_version":"1.0.0"}}"#,
        )
        .expect("begin event");

        let output = AssemblyAiStreamingOutput::from_event_with_config(
            event,
            &AssemblyAiStreamingConfig::with_model(Some("u3-rt-pro".to_string())).expect("config"),
        );

        assert_eq!(
            output,
            AssemblyAiStreamingOutput::Error {
                message:
                    "AssemblyAI streaming applied mode balanced instead of requested max_accuracy"
                        .to_string(),
            }
        );
    }

    #[test]
    fn streaming_snapshot_uses_requested_model_for_started_event() {
        let snapshot = AssemblyAiStreamingSnapshot::new(
            "session-1".to_string(),
            "universal-3-5-pro".to_string(),
        );

        assert_eq!(
            snapshot.provider_events[0].model_id.as_deref(),
            Some("universal-3-5-pro"),
        );
    }

    #[test]
    fn streaming_handle_returns_error_instead_of_silently_dropping_full_channel_audio() {
        let (audio_tx, mut audio_rx) = mpsc::channel(1);
        audio_tx
            .try_send(StreamingClientMessage::Audio(vec![1; 1_600]))
            .expect("fill channel");
        let mut handle = StreamingSessionHandle::test_with_sender("session-1", audio_tx);

        let err = handle
            .send_pcm16(&[2; 1_600])
            .expect_err("full audio channel should fail");

        assert!(err
            .message
            .contains("AssemblyAI streaming audio channel is full"));
        assert_eq!(handle.dropped_frames(), 1);
        assert!(matches!(
            audio_rx.try_recv().expect("queued message"),
            StreamingClientMessage::Audio(_),
        ));
    }

    #[test]
    fn streaming_handle_flushes_partial_frame_before_terminate() {
        let (audio_tx, mut audio_rx) = mpsc::channel(4);
        let mut handle = StreamingSessionHandle::test_with_sender("session-1", audio_tx);
        handle.send_pcm16(&[3; 10]).expect("partial write");

        assert!(handle.request_stop());

        match audio_rx.try_recv().expect("padded audio frame") {
            StreamingClientMessage::Audio(frame) => {
                assert_eq!(frame.len(), 1_600);
                assert_eq!(&frame[..10], &[3; 10]);
                assert!(frame[10..].iter().all(|byte| *byte == 0));
            }
            StreamingClientMessage::Terminate => panic!("terminate arrived before audio flush"),
        }
        assert!(matches!(
            audio_rx.try_recv().expect("terminate message"),
            StreamingClientMessage::Terminate,
        ));
    }

    #[test]
    fn converts_provider_error_events_to_streaming_errors() {
        let output = AssemblyAiStreamingOutput::from_event(
            parse_streaming_event(
                r#"{"type":"Error","error_code":3007,"error":"Audio transmission rate exceeded"}"#,
            )
            .expect("error event"),
        );

        assert_eq!(
            output,
            AssemblyAiStreamingOutput::Error {
                message: "AssemblyAI streaming error 3007: Audio transmission rate exceeded"
                    .to_string(),
            }
        );
    }

    #[test]
    fn streaming_snapshot_records_final_text_without_partial_text() {
        let mut snapshot =
            AssemblyAiStreamingSnapshot::new("session-1".to_string(), "u3-rt-pro".to_string());

        snapshot.record_output(&AssemblyAiStreamingOutput::Partial {
            turn_order: 1,
            text: "draft text".to_string(),
        });
        snapshot.record_output(&AssemblyAiStreamingOutput::Final {
            turn_order: 1,
            text: "final text".to_string(),
        });

        assert_eq!(snapshot.partial_count, 1);
        assert_eq!(snapshot.final_text.as_deref(), Some("final text"));
        assert_eq!(
            snapshot.provider_events[0].event_type,
            "stream_session_started"
        );
        assert_eq!(
            snapshot.provider_events[1].event_type,
            "stream_partial_received"
        );
        assert_eq!(snapshot.provider_events[1].metadata, None);
        assert_eq!(
            snapshot.provider_events[2].event_type,
            "stream_final_received"
        );
        assert_eq!(
            snapshot.provider_events[2]
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("characterCount"))
                .and_then(serde_json::Value::as_u64),
            Some(10)
        );
    }

    #[test]
    fn streaming_snapshot_records_termination_billing_metrics() {
        let mut snapshot =
            AssemblyAiStreamingSnapshot::new("session-1".to_string(), "u3-rt-pro".to_string());
        snapshot.bytes_sent = 3_200;
        snapshot.frame_count = 2;
        snapshot.dropped_frames = 1;

        snapshot.record_output(&AssemblyAiStreamingOutput::Terminated {
            audio_duration_ms: 4_000,
            session_duration_ms: 6_000,
        });

        let event = snapshot.provider_events.last().expect("termination event");
        assert_eq!(event.event_type, "stream_terminated");
        assert_eq!(event.duration_ms, Some(6_000));
        assert_eq!(event.bytes_sent, Some(3_200));
        assert_eq!(event.frame_count, Some(2));
        assert_eq!(
            event
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("audioDurationMs"))
                .and_then(serde_json::Value::as_u64),
            Some(4_000)
        );
        assert_eq!(
            event
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("droppedFrames"))
                .and_then(serde_json::Value::as_u64),
            Some(1)
        );
    }

    #[test]
    fn managed_streaming_state_rejects_concurrent_start_and_stops_once() {
        let state = ManagedAssemblyAiStreamingState::default();
        let handle = StreamingSessionHandle::test("session-1");

        assert!(state.try_start(handle).is_ok());
        assert!(state
            .try_start(StreamingSessionHandle::test("session-2"))
            .is_err());

        assert!(state.request_stop());
        assert!(!state.request_stop());
        assert!(state.take_active().is_some());
        assert!(state.take_active().is_none());
    }
}

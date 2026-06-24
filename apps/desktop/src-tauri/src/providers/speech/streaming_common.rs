use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use crate::providers::errors::{ProviderError, ProviderFailure};

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StreamingAudioWrite {
    pub(crate) bytes_sent: usize,
    pub(crate) frame_count: usize,
    pub(crate) dropped_frames: u64,
}

#[derive(Debug)]
pub(crate) struct Pcm16FrameChunker {
    frame_bytes: usize,
    pending: Vec<u8>,
}

impl Pcm16FrameChunker {
    pub(crate) fn new(frame_bytes: usize) -> Result<Self, ProviderError> {
        if frame_bytes == 0 {
            return Err(ProviderFailure::InvalidRequest(
                "streaming PCM frame config must be non-zero".to_string(),
            )
            .into());
        }

        Ok(Self {
            frame_bytes,
            pending: Vec::with_capacity(frame_bytes),
        })
    }

    pub(crate) fn for_pcm16(sample_rate_hz: u32, frame_ms: u32) -> Result<Self, ProviderError> {
        if sample_rate_hz == 0 || frame_ms == 0 {
            return Err(ProviderFailure::InvalidRequest(
                "streaming PCM frame config must be non-zero".to_string(),
            )
            .into());
        }

        let samples_per_frame = sample_rate_hz
            .checked_mul(frame_ms)
            .and_then(|value| value.checked_div(1_000))
            .ok_or_else(|| {
                ProviderError::from(ProviderFailure::InvalidRequest(
                    "streaming PCM frame config is invalid".to_string(),
                ))
            })?;
        let frame_bytes = samples_per_frame
            .checked_mul(2)
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| {
                ProviderError::from(ProviderFailure::InvalidRequest(
                    "streaming PCM frame size is too large".to_string(),
                ))
            })?;

        Self::new(frame_bytes)
    }

    pub(crate) fn push(&mut self, bytes: &[u8]) -> Vec<Vec<u8>> {
        self.pending.extend_from_slice(bytes);
        let frame_count = self.pending.len() / self.frame_bytes;
        let mut frames = Vec::with_capacity(frame_count);

        for chunk in self.pending[..frame_count * self.frame_bytes].chunks(self.frame_bytes) {
            frames.push(chunk.to_vec());
        }

        if frame_count > 0 {
            self.pending.drain(..frame_count * self.frame_bytes);
        }

        frames
    }

    #[cfg(test)]
    pub(crate) fn pending_len(&self) -> usize {
        self.pending.len()
    }

    pub(crate) fn flush_padded_frame(&mut self) -> Option<Vec<u8>> {
        if self.pending.is_empty() {
            return None;
        }

        let mut frame = Vec::with_capacity(self.frame_bytes);
        frame.extend_from_slice(&self.pending);
        frame.resize(self.frame_bytes, 0);
        self.pending.clear();
        Some(frame)
    }
}

#[derive(Debug, Default)]
pub(crate) struct StreamingSessionState {
    stopping: AtomicBool,
}

impl StreamingSessionState {
    pub(crate) fn request_stop(&self) -> bool {
        self.stopping
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    #[cfg(test)]
    pub(crate) fn is_stopping(&self) -> bool {
        self.stopping.load(Ordering::Acquire)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcm16_frame_chunker_emits_configured_frames_and_keeps_remainder() {
        let mut chunker = Pcm16FrameChunker::new(4_096).expect("valid frame config");
        let audio = vec![7; 8_192 + 10];

        let frames = chunker.push(&audio);

        assert_eq!(frames.len(), 2);
        assert!(frames.iter().all(|frame| frame.len() == 4_096));
        assert_eq!(chunker.pending_len(), 10);
    }

    #[test]
    fn pcm16_frame_chunker_builds_fifty_ms_sixteen_khz_frames() {
        let mut chunker = Pcm16FrameChunker::for_pcm16(16_000, 50).expect("valid frame config");
        let audio = vec![7; 1_600 + 10];

        let frames = chunker.push(&audio);

        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].len(), 1_600);
        assert_eq!(chunker.pending_len(), 10);
    }

    #[test]
    fn pcm16_frame_chunker_flushes_partial_trailing_audio_with_silence_padding() {
        let mut chunker = Pcm16FrameChunker::new(4_096).expect("valid frame config");
        assert!(chunker.push(&[7; 10]).is_empty());

        let frame = chunker.flush_padded_frame().expect("padded frame");

        assert_eq!(frame.len(), 4_096);
        assert_eq!(&frame[..10], &[7; 10]);
        assert!(frame[10..].iter().all(|byte| *byte == 0));
        assert_eq!(chunker.pending_len(), 0);
        assert!(chunker.flush_padded_frame().is_none());
    }
}

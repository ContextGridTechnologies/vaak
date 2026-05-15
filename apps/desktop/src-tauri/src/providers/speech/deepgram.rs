use async_trait::async_trait;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::Deserialize;

use crate::providers::errors::{ProviderError, ProviderFailure};
use crate::providers::speech::SpeechProvider;
use crate::providers::{build_http_client, request_failure, TranscriptResult, TranscriptionInput};

pub const PROVIDER_ID: &str = "deepgram";
pub const DEFAULT_MODEL: &str = "nova-3";
const LISTEN_URL: &str = "https://api.deepgram.com/v1/listen";

#[derive(Default)]
pub struct DeepgramSpeechProvider;

#[derive(Debug, Deserialize)]
struct DeepgramListenResponse {
    metadata: Option<DeepgramMetadata>,
    results: Option<DeepgramResults>,
}

#[derive(Debug, Deserialize)]
struct DeepgramMetadata {
    duration: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DeepgramResults {
    channels: Vec<DeepgramChannel>,
}

#[derive(Debug, Deserialize)]
struct DeepgramChannel {
    alternatives: Vec<DeepgramAlternative>,
}

#[derive(Debug, Deserialize)]
struct DeepgramAlternative {
    transcript: Option<String>,
}

#[async_trait]
impl SpeechProvider for DeepgramSpeechProvider {
    async fn transcribe(
        &self,
        api_key: String,
        input: TranscriptionInput,
    ) -> Result<TranscriptResult, ProviderError> {
        validate_input(&input)?;

        let model = resolve_model(input.model.as_deref()).to_string();
        let client = build_http_client()?;
        let response = client
            .execute(build_listen_request(
                &client,
                &api_key,
                &input.audio,
                &input.mime_type,
                &model,
                input.language.as_deref(),
            )?)
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            return Err(request_failure("Deepgram", status));
        }

        let payload = response.json::<DeepgramListenResponse>().await?;
        resolve_listen_response(payload, &model)
    }
}

fn validate_input(input: &TranscriptionInput) -> Result<(), ProviderError> {
    if input.audio.is_empty() {
        return Err(ProviderFailure::InvalidRequest("audio is empty".to_string()).into());
    }

    Ok(())
}

fn resolve_model(model: Option<&str>) -> &str {
    model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL)
}

fn build_listen_request(
    client: &reqwest::Client,
    api_key: &str,
    audio: &[u8],
    mime_type: &str,
    model: &str,
    language: Option<&str>,
) -> Result<reqwest::Request, ProviderError> {
    let mut query = vec![
        ("model", model.to_string()),
        ("smart_format", "true".to_string()),
    ];

    if let Some(language) = language.map(str::trim).filter(|value| !value.is_empty()) {
        query.push(("language", language.to_string()));
    }

    client
        .post(LISTEN_URL)
        .header(AUTHORIZATION, format!("Token {api_key}"))
        .header(CONTENT_TYPE, mime_type)
        .query(&query)
        .body(audio.to_vec())
        .build()
        .map_err(ProviderError::from)
}

fn resolve_listen_response(
    payload: DeepgramListenResponse,
    model: &str,
) -> Result<TranscriptResult, ProviderError> {
    let transcript = payload
        .results
        .and_then(|results| results.channels.into_iter().next())
        .and_then(|channel| channel.alternatives.into_iter().next())
        .and_then(|alternative| alternative.transcript)
        .ok_or(ProviderFailure::InvalidResponse)?;

    if transcript.trim().is_empty() {
        return Err(ProviderFailure::InvalidResponse.into());
    }

    Ok(TranscriptResult {
        provider_id: PROVIDER_ID.to_string(),
        model: model.to_string(),
        text: transcript,
        duration_ms: payload
            .metadata
            .and_then(|metadata| metadata.duration)
            .and_then(seconds_to_millis),
    })
}

fn seconds_to_millis(seconds: f64) -> Option<u64> {
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }

    Some((seconds * 1000.0).round() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};

    #[test]
    fn request_uses_listen_endpoint_auth_audio_content_type_and_query_parameters() {
        let client = reqwest::Client::new();
        let request = build_listen_request(
            &client,
            "dg-test",
            &[1, 2, 3],
            "audio/webm",
            "nova-3",
            Some("en-US"),
        )
        .expect("request to build");

        assert_eq!(
            request.url().as_str(),
            "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en-US"
        );
        assert_eq!(
            request
                .headers()
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Token dg-test")
        );
        assert_eq!(
            request
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("audio/webm")
        );
        assert_eq!(
            request.body().and_then(reqwest::Body::as_bytes),
            Some(&[1, 2, 3][..])
        );
    }

    #[test]
    fn request_omits_blank_language() {
        let client = reqwest::Client::new();
        let request =
            build_listen_request(&client, "dg-test", &[1], "audio/wav", "nova-3", Some("   "))
                .expect("request to build");

        assert_eq!(
            request.url().query(),
            Some("model=nova-3&smart_format=true")
        );
    }

    #[test]
    fn successful_response_maps_transcript_and_duration() {
        let result = resolve_listen_response(
            DeepgramListenResponse {
                metadata: Some(DeepgramMetadata {
                    duration: Some(1.8),
                }),
                results: Some(DeepgramResults {
                    channels: vec![DeepgramChannel {
                        alternatives: vec![DeepgramAlternative {
                            transcript: Some("hello from deepgram".to_string()),
                        }],
                    }],
                }),
            },
            "nova-3",
        )
        .expect("valid response");

        assert_eq!(result.provider_id, "deepgram");
        assert_eq!(result.model, "nova-3");
        assert_eq!(result.text, "hello from deepgram");
        assert_eq!(result.duration_ms, Some(1_800));
    }

    #[test]
    fn blank_transcript_is_an_invalid_provider_response() {
        let err = resolve_listen_response(
            DeepgramListenResponse {
                metadata: Some(DeepgramMetadata {
                    duration: Some(1.0),
                }),
                results: Some(DeepgramResults {
                    channels: vec![DeepgramChannel {
                        alternatives: vec![DeepgramAlternative {
                            transcript: Some("   ".to_string()),
                        }],
                    }],
                }),
            },
            "nova-3",
        )
        .expect_err("blank transcript should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }

    #[test]
    fn malformed_response_is_an_invalid_provider_response() {
        let err = resolve_listen_response(
            DeepgramListenResponse {
                metadata: None,
                results: Some(DeepgramResults { channels: vec![] }),
            },
            "nova-3",
        )
        .expect_err("missing alternatives should fail");

        assert_eq!(err.code, "invalid_provider_response");
    }

    #[test]
    fn empty_audio_is_an_invalid_request() {
        let err = validate_input(&TranscriptionInput {
            audio: Vec::new(),
            mime_type: "audio/webm".to_string(),
            language: None,
            prompt: Some("ignored by deepgram".to_string()),
            model: None,
        })
        .expect_err("empty audio should fail");

        assert_eq!(err.code, "invalid_provider_request");
        assert_eq!(err.message, "audio is empty");
    }
}

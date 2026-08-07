use crate::providers::errors::{ProviderError, ProviderFailure};
use serde::{Deserialize, Serialize};

const TOKEN_URL: &str = "https://agents.assemblyai.com/v1/token";
const TOKEN_EXPIRES_SECONDS: u16 = 60;
const SESSION_DURATION_SECONDS: u16 = 900;

#[derive(Debug, Deserialize)]
struct AssemblyAiVoiceTokenPayload {
    token: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AssemblyAiVoiceToken {
    pub token: String,
}

pub async fn mint_assemblyai_voice_token(
    client: &reqwest::Client,
    api_key: &str,
) -> Result<AssemblyAiVoiceToken, ProviderError> {
    let response = client
        .execute(build_assemblyai_voice_token_request(client, api_key)?)
        .await?;
    if !response.status().is_success() {
        return Err(ProviderFailure::Request(format!(
            "AssemblyAI voice token request failed with status {}",
            response.status()
        ))
        .into());
    }
    validate_token_payload(response.json().await?)
}

fn build_assemblyai_voice_token_request(
    client: &reqwest::Client,
    api_key: &str,
) -> Result<reqwest::Request, ProviderError> {
    client
        .get(TOKEN_URL)
        .query(&[
            ("expires_in_seconds", TOKEN_EXPIRES_SECONDS),
            ("max_session_duration_seconds", SESSION_DURATION_SECONDS),
        ])
        .bearer_auth(api_key)
        .build()
        .map_err(ProviderError::from)
}

fn validate_token_payload(
    payload: AssemblyAiVoiceTokenPayload,
) -> Result<AssemblyAiVoiceToken, ProviderError> {
    let token = payload.token.trim();
    if token.is_empty() {
        return Err(ProviderFailure::InvalidResponse.into());
    }
    Ok(AssemblyAiVoiceToken {
        token: token.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use futures_util::{SinkExt, StreamExt};
    use reqwest::header::AUTHORIZATION;
    use tokio_tungstenite::tungstenite::Message;

    #[test]
    fn token_request_uses_a_bearer_key_and_bounded_lifetimes() {
        let client = reqwest::Client::new();

        let request = build_assemblyai_voice_token_request(&client, "assembly-key").unwrap();

        assert_eq!(
            request.url().as_str(),
            "https://agents.assemblyai.com/v1/token?expires_in_seconds=60&max_session_duration_seconds=900"
        );
        assert_eq!(
            request
                .headers()
                .get(AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Bearer assembly-key")
        );
    }

    #[test]
    fn token_payload_rejects_an_empty_token() {
        let error = validate_token_payload(AssemblyAiVoiceTokenPayload {
            token: "  ".to_string(),
        })
        .unwrap_err();

        assert_eq!(error.code, "invalid_provider_response");
    }

    #[test]
    #[ignore = "requires the saved AssemblyAI key and live Voice Agent API access"]
    fn live_saved_key_receives_voice_agent_greeting_audio() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let api_key = crate::providers::credentials::provider_key("assemblyai").unwrap();
                let client = crate::providers::build_http_client().unwrap();
                let token = mint_assemblyai_voice_token(&client, &api_key)
                    .await
                    .unwrap();
                let mut url = reqwest::Url::parse("wss://agents.assemblyai.com/v1/ws").unwrap();
                url.query_pairs_mut().append_pair("token", &token.token);
                let (mut socket, _) = tokio_tungstenite::connect_async(url.as_str())
                    .await
                    .unwrap();

                socket
                    .send(Message::Text(
                        serde_json::json!({
                            "type": "session.update",
                            "session": {
                                "system_prompt": "You are a concise test assistant.",
                                "greeting": "Vaak voice agent test ready.",
                                "input": { "format": { "encoding": "audio/pcm" } },
                                "output": {
                                    "voice": "ivy",
                                    "format": { "encoding": "audio/pcm" }
                                },
                                "tools": []
                            }
                        })
                        .to_string()
                        .into(),
                    ))
                    .await
                    .unwrap();

                let mut ready = false;
                let mut session_id = None;
                let mut greeting_audio = Vec::new();
                let mut audio_chunks = 0_u32;
                let mut reply_started = false;
                let stream_result =
                    tokio::time::timeout(std::time::Duration::from_secs(20), async {
                        while let Some(message) = socket.next().await {
                            let message = message.unwrap();
                            let Message::Text(text) = message else {
                                continue;
                            };
                            let event: serde_json::Value = serde_json::from_str(&text).unwrap();
                            match event["type"].as_str() {
                                Some("session.ready") => {
                                    ready = true;
                                    session_id = event["session_id"].as_str().map(str::to_string);
                                }
                                Some("reply.started") => reply_started = true,
                                Some("reply.audio") => {
                                    audio_chunks += 1;
                                    let chunk = base64::engine::general_purpose::STANDARD
                                        .decode(event["data"].as_str().unwrap())
                                        .unwrap();
                                    let audible = chunk.chunks_exact(2).any(|sample| {
                                        i16::from_le_bytes([sample[0], sample[1]]).unsigned_abs()
                                            > 256
                                    });
                                    greeting_audio.extend(chunk);
                                    if audible {
                                        break;
                                    }
                                }
                                Some("session.error") => panic!("{event}"),
                                _ => {}
                            }
                        }
                    })
                    .await;

                assert!(ready, "AssemblyAI never emitted session.ready");
                let peak = greeting_audio
                    .chunks_exact(2)
                    .map(|sample| i16::from_le_bytes([sample[0], sample[1]]).unsigned_abs())
                    .max()
                    .unwrap_or_default();
                assert!(
                    peak > 256,
                    "AssemblyAI greeting was silent: session_id={session_id:?} bytes={} peak={peak} timed_out={} reply_started={reply_started} audio_chunks={audio_chunks}",
                    greeting_audio.len(),
                    stream_result.is_err()
                );
                eprintln!(
                    "AssemblyAI greeting PCM: bytes={} peak={peak}",
                    greeting_audio.len()
                );
                socket
                    .send(Message::Text(
                        serde_json::json!({ "type": "session.end" })
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
            });
    }

    #[test]
    #[ignore = "requires the saved AssemblyAI key and live Voice Agent API access"]
    fn live_saved_key_runs_create_folder_tool_loop() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let pcm = read_live_test_pcm();
                let folder_name = format!("vaak-agent-live-loop-{}", std::process::id());
                let system_prompt = format!(
                    "You are a concise Windows voice assistant. For every user utterance, immediately call create_folder with the exact relative path {folder_name}. Never answer a user utterance without calling that tool. Confirm after the tool returns."
                );
                let api_key = crate::providers::credentials::provider_key("assemblyai").unwrap();
                let client = crate::providers::build_http_client().unwrap();
                let token = mint_assemblyai_voice_token(&client, &api_key)
                    .await
                    .unwrap();
                let mut url = reqwest::Url::parse("wss://agents.assemblyai.com/v1/ws").unwrap();
                url.query_pairs_mut().append_pair("token", &token.token);
                let (mut socket, _) = tokio_tungstenite::connect_async(url.as_str())
                    .await
                    .unwrap();

                socket
                    .send(Message::Text(
                        serde_json::json!({
                            "type": "session.update",
                            "session": {
                                "system_prompt": system_prompt,
                                "input": {
                                    "format": { "encoding": "audio/pcm" },
                                    "turn_detection": {
                                        "vad_threshold": 0.3,
                                        "min_silence": 500,
                                        "max_silence": 1000
                                    }
                                },
                                "output": {
                                    "voice": "ivy",
                                    "format": { "encoding": "audio/pcm" }
                                },
                                "tools": [{
                                    "type": "function",
                                    "name": "create_folder",
                                    "description": "Create a folder inside the user's home directory.",
                                    "parameters": {
                                        "type": "object",
                                        "properties": {
                                            "path": { "type": "string" }
                                        },
                                        "required": ["path"],
                                        "additionalProperties": false
                                    }
                                }]
                            }
                        })
                        .to_string()
                        .into(),
                    ))
                    .await
                    .unwrap();

                wait_for_session_ready(&mut socket).await;
                let silence = vec![0_u8; 2_400];
                for _ in 0..20 {
                    send_audio_frame(&mut socket, &silence).await;
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
                for frame in pcm.chunks(2_400) {
                    send_audio_frame(&mut socket, frame).await;
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
                for _ in 0..30 {
                    send_audio_frame(&mut socket, &silence).await;
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }

                let (call_id, name, arguments) = wait_for_tool_call(&mut socket).await;
                assert_eq!(name, "create_folder");
                let requested_path = arguments["path"].as_str().unwrap();
                assert_eq!(requested_path, folder_name);
                let result = crate::agent::execute_tool(&name, arguments).unwrap();
                let created_path = result["path"].as_str().unwrap().to_string();
                socket
                    .send(Message::Text(
                        serde_json::json!({
                            "type": "tool.result",
                            "call_id": call_id,
                            "result": serde_json::to_string(&result).unwrap()
                        })
                        .to_string()
                        .into(),
                    ))
                    .await
                    .unwrap();

                let _ = wait_for_reply_done(&mut socket, true).await;
                let folder_path = dirs::home_dir().unwrap().join(created_path);
                assert!(
                    folder_path.is_dir(),
                    "the live agent tool did not create its requested folder"
                );
                socket
                    .send(Message::Text(
                        serde_json::json!({ "type": "session.end" })
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
                std::fs::remove_dir(folder_path).unwrap();
            });
    }

    async fn wait_for_tool_call<S>(socket: &mut S) -> (String, String, serde_json::Value)
    where
        S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
            + Unpin,
    {
        tokio::time::timeout(std::time::Duration::from_secs(30), async {
            while let Some(message) = socket.next().await {
                let Message::Text(text) = message.unwrap() else {
                    continue;
                };
                let event: serde_json::Value = serde_json::from_str(&text).unwrap();
                match event["type"].as_str() {
                    Some("tool.call") => {
                        return (
                            event["call_id"].as_str().unwrap().to_string(),
                            event["name"].as_str().unwrap().to_string(),
                            event["arguments"].clone(),
                        );
                    }
                    Some("session.error") => panic!("{event}"),
                    _ => {}
                }
            }
            panic!("AssemblyAI closed before requesting the tool")
        })
        .await
        .unwrap()
    }

    async fn wait_for_session_ready<S>(socket: &mut S)
    where
        S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
            + Unpin,
    {
        tokio::time::timeout(std::time::Duration::from_secs(20), async {
            while let Some(message) = socket.next().await {
                let Message::Text(text) = message.unwrap() else {
                    continue;
                };
                let event: serde_json::Value = serde_json::from_str(&text).unwrap();
                match event["type"].as_str() {
                    Some("session.ready") => return,
                    Some("session.error") => panic!("{event}"),
                    _ => {}
                }
            }
            panic!("AssemblyAI closed before session.ready")
        })
        .await
        .unwrap();
    }

    fn read_live_test_pcm() -> Vec<u8> {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../src/assets/provider-test/librispeech-61-70968-0000.flac");
        // vaak: the ignored hardware-free live check reuses the existing human-speech fixture;
        // ffmpeg is already a Vaak runtime prerequisite and avoids another audio decoder.
        let output = std::process::Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-i"])
            .arg(fixture)
            .args(["-f", "s16le", "-ac", "1", "-ar", "24000", "pipe:1"])
            .output()
            .expect("ffmpeg is required for the live voice-agent test");
        assert!(
            output.status.success(),
            "ffmpeg failed to decode the fixture"
        );
        assert!(!output.stdout.is_empty(), "decoded fixture was empty");
        output.stdout
    }

    async fn send_audio_frame<S>(socket: &mut S, frame: &[u8])
    where
        S: futures_util::Sink<Message> + Unpin,
        S::Error: std::fmt::Debug,
    {
        socket
            .send(Message::Text(
                serde_json::json!({
                    "type": "input.audio",
                    "audio": base64::engine::general_purpose::STANDARD.encode(frame)
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
    }

    async fn wait_for_reply_done<S>(socket: &mut S, require_audio: bool) -> Vec<u8>
    where
        S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
            + Unpin,
    {
        tokio::time::timeout(std::time::Duration::from_secs(30), async {
            let mut audio = Vec::new();
            while let Some(message) = socket.next().await {
                let Message::Text(text) = message.unwrap() else {
                    continue;
                };
                let event: serde_json::Value = serde_json::from_str(&text).unwrap();
                match event["type"].as_str() {
                    Some("reply.audio") => audio.extend(
                        base64::engine::general_purpose::STANDARD
                            .decode(event["data"].as_str().unwrap())
                            .unwrap(),
                    ),
                    Some("reply.done") => {
                        assert!(
                            !require_audio || !audio.is_empty(),
                            "AssemblyAI reply contained no audio"
                        );
                        return audio;
                    }
                    Some("session.error") => panic!("{event}"),
                    _ => {}
                }
            }
            panic!("AssemblyAI closed before completing its reply")
        })
        .await
        .unwrap()
    }
}

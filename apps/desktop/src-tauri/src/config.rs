#[cfg(test)]
use std::collections::BTreeMap;

use log::LevelFilter;
use thiserror::Error;

const APP_ENV_KEY: &str = "VAAK_APP_ENV";
const LOG_LEVEL_KEY: &str = "VAAK_LOG_LEVEL";
const UPDATE_CHANNEL_KEY: &str = "VAAK_UPDATE_CHANNEL";
const TELEMETRY_KEY: &str = "VAAK_ENABLE_TELEMETRY";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum AppEnvironment {
    Development,
    Production,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RuntimeLogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum UpdateChannel {
    Dev,
    Beta,
    Stable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct RuntimeConfig {
    pub(crate) app_env: AppEnvironment,
    pub(crate) log_level: RuntimeLogLevel,
    pub(crate) update_channel: UpdateChannel,
    pub(crate) telemetry_enabled: bool,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub(crate) enum ConfigError {
    #[error("{key} must be {expected}")]
    InvalidValue {
        key: &'static str,
        expected: &'static str,
    },
    #[error("{key}: {reason}")]
    InvalidProductionValue {
        key: &'static str,
        reason: &'static str,
    },
}

impl RuntimeConfig {
    pub(crate) fn from_process_env() -> Result<Self, ConfigError> {
        let app_env = std::env::var(APP_ENV_KEY).ok();
        let log_level = std::env::var(LOG_LEVEL_KEY).ok();
        let update_channel = std::env::var(UPDATE_CHANNEL_KEY).ok();
        let telemetry_enabled = std::env::var(TELEMETRY_KEY).ok();

        Self::from_values(
            app_env.as_deref(),
            log_level.as_deref(),
            update_channel.as_deref(),
            telemetry_enabled.as_deref(),
        )
    }

    #[cfg(test)]
    fn from_pairs<const N: usize>(
        pairs: [(&'static str, &'static str); N],
    ) -> Result<Self, ConfigError> {
        let values = BTreeMap::from(pairs);
        Self::from_values(
            values.get(APP_ENV_KEY).copied(),
            values.get(LOG_LEVEL_KEY).copied(),
            values.get(UPDATE_CHANNEL_KEY).copied(),
            values.get(TELEMETRY_KEY).copied(),
        )
    }

    fn from_values(
        app_env: Option<&str>,
        log_level: Option<&str>,
        update_channel: Option<&str>,
        telemetry_enabled: Option<&str>,
    ) -> Result<Self, ConfigError> {
        let app_env = parse_app_env(app_env)?;
        let log_level = parse_log_level(log_level, app_env)?;
        let update_channel = parse_update_channel(update_channel, app_env)?;
        let telemetry_enabled = parse_boolean(telemetry_enabled, TELEMETRY_KEY)?;

        Ok(Self {
            app_env,
            log_level,
            update_channel,
            telemetry_enabled,
        })
    }
}

impl RuntimeLogLevel {
    pub(crate) fn as_level_filter(self) -> LevelFilter {
        match self {
            Self::Trace => LevelFilter::Trace,
            Self::Debug => LevelFilter::Debug,
            Self::Info => LevelFilter::Info,
            Self::Warn => LevelFilter::Warn,
            Self::Error => LevelFilter::Error,
        }
    }
}

fn parse_app_env(value: Option<&str>) -> Result<AppEnvironment, ConfigError> {
    match normalize(value).as_deref() {
        Some("development") => Ok(AppEnvironment::Development),
        Some("production") => Ok(AppEnvironment::Production),
        Some(_) => Err(ConfigError::InvalidValue {
            key: APP_ENV_KEY,
            expected: "development or production",
        }),
        None if cfg!(debug_assertions) => Ok(AppEnvironment::Development),
        None => Ok(AppEnvironment::Production),
    }
}

fn parse_log_level(
    value: Option<&str>,
    app_env: AppEnvironment,
) -> Result<RuntimeLogLevel, ConfigError> {
    let log_level = match normalize(value).as_deref() {
        Some("trace") => RuntimeLogLevel::Trace,
        Some("debug") => RuntimeLogLevel::Debug,
        Some("info") => RuntimeLogLevel::Info,
        Some("warn") => RuntimeLogLevel::Warn,
        Some("error") => RuntimeLogLevel::Error,
        Some(_) => {
            return Err(ConfigError::InvalidValue {
                key: LOG_LEVEL_KEY,
                expected: "trace, debug, info, warn, or error",
            });
        }
        None if app_env == AppEnvironment::Development => RuntimeLogLevel::Debug,
        None => RuntimeLogLevel::Info,
    };

    if app_env == AppEnvironment::Production
        && matches!(log_level, RuntimeLogLevel::Trace | RuntimeLogLevel::Debug)
    {
        return Err(ConfigError::InvalidProductionValue {
            key: LOG_LEVEL_KEY,
            reason: "production logs must use info, warn, or error",
        });
    }

    Ok(log_level)
}

fn parse_update_channel(
    value: Option<&str>,
    app_env: AppEnvironment,
) -> Result<UpdateChannel, ConfigError> {
    let update_channel = match normalize(value).as_deref() {
        Some("dev") => UpdateChannel::Dev,
        Some("beta") => UpdateChannel::Beta,
        Some("stable") => UpdateChannel::Stable,
        Some(_) => {
            return Err(ConfigError::InvalidValue {
                key: UPDATE_CHANNEL_KEY,
                expected: "dev, beta, or stable",
            });
        }
        None if app_env == AppEnvironment::Development => UpdateChannel::Dev,
        None => UpdateChannel::Stable,
    };

    if app_env == AppEnvironment::Production && update_channel == UpdateChannel::Dev {
        return Err(ConfigError::InvalidProductionValue {
            key: UPDATE_CHANNEL_KEY,
            reason: "production builds must use beta or stable update channels",
        });
    }

    Ok(update_channel)
}

fn parse_boolean(value: Option<&str>, key: &'static str) -> Result<bool, ConfigError> {
    match normalize(value).as_deref() {
        Some("true" | "1") => Ok(true),
        Some("false" | "0") | None => Ok(false),
        Some(_) => Err(ConfigError::InvalidValue {
            key,
            expected: "true or false",
        }),
    }
}

fn normalize(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_development_for_debug_builds() {
        let config = RuntimeConfig::from_pairs([]).unwrap();

        assert_eq!(config.app_env, AppEnvironment::Development);
        assert_eq!(config.log_level, RuntimeLogLevel::Debug);
        assert_eq!(config.update_channel, UpdateChannel::Dev);
        assert!(!config.telemetry_enabled);
    }

    #[test]
    fn production_rejects_debug_logging() {
        let err = RuntimeConfig::from_pairs([
            ("VAAK_APP_ENV", "production"),
            ("VAAK_LOG_LEVEL", "debug"),
        ])
        .unwrap_err();

        assert_eq!(
            err,
            ConfigError::InvalidProductionValue {
                key: "VAAK_LOG_LEVEL",
                reason: "production logs must use info, warn, or error"
            }
        );
    }

    #[test]
    fn production_rejects_dev_update_channel() {
        let err = RuntimeConfig::from_pairs([
            ("VAAK_APP_ENV", "production"),
            ("VAAK_UPDATE_CHANNEL", "dev"),
        ])
        .unwrap_err();

        assert_eq!(
            err,
            ConfigError::InvalidProductionValue {
                key: "VAAK_UPDATE_CHANNEL",
                reason: "production builds must use beta or stable update channels"
            }
        );
    }
}

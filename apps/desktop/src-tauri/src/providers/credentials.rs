use keyring::{Entry, Error as KeyringError};

use crate::providers::ProviderConfig;

use super::errors::{ProviderError, ProviderFailure};

const SERVICE_NAME: &str = "ai.vaak.desktop";
const SELECTED_SPEECH_PROVIDER_ACCOUNT: &str = "selected.speech-provider";
const LEGACY_SELECTED_SPEECH_PROVIDER_ACCOUNT: &str = "selected:speech-provider";

trait CredentialStore {
    fn get_password(&self, account: &str) -> Result<String, KeyringError>;
    fn set_password(&self, account: &str, password: &str) -> Result<(), KeyringError>;
}

struct KeyringCredentialStore;

impl CredentialStore for KeyringCredentialStore {
    fn get_password(&self, account: &str) -> Result<String, KeyringError> {
        Entry::new(SERVICE_NAME, account)?.get_password()
    }

    fn set_password(&self, account: &str, password: &str) -> Result<(), KeyringError> {
        Entry::new(SERVICE_NAME, account)?.set_password(password)
    }
}

pub fn save_provider_key(provider_id: &str, api_key: &str) -> Result<(), ProviderError> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(ProviderFailure::InvalidRequest("API key cannot be empty".to_string()).into());
    }

    let entry = provider_key_entry(provider_id)?;
    entry.set_password(trimmed).map_err(map_keyring_error)?;

    match entry.get_password().map_err(map_password_read_error) {
        Ok(saved) if !saved.trim().is_empty() => Ok(()),
        Ok(_) => Err(ProviderFailure::MissingCredential.into()),
        Err(err) => Err(err),
    }
}

pub fn provider_key(provider_id: &str) -> Result<String, ProviderError> {
    read_password_with_legacy(
        &provider_key_account(provider_id),
        &legacy_provider_key_account(provider_id),
    )
}

pub fn has_provider_key(provider_id: &str) -> Result<bool, ProviderError> {
    match provider_key(provider_id) {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(err) if err.code == "missing_provider_key" => Ok(false),
        Err(err) => Err(err),
    }
}

pub fn legacy_provider_config(provider_id: &str) -> Result<Option<ProviderConfig>, ProviderError> {
    match read_password_with_legacy(
        &provider_config_account(provider_id),
        &legacy_provider_config_account(provider_id),
    ) {
        Ok(value) => serde_json::from_str::<ProviderConfig>(&value)
            .map(Some)
            .map_err(|err| ProviderFailure::InvalidRequest(err.to_string()).into()),
        Err(err) if err.code == "missing_provider_key" => Ok(None),
        Err(err) => Err(err),
    }
}

pub fn legacy_selected_speech_provider() -> Result<Option<String>, ProviderError> {
    match read_password_with_legacy(
        SELECTED_SPEECH_PROVIDER_ACCOUNT,
        LEGACY_SELECTED_SPEECH_PROVIDER_ACCOUNT,
    ) {
        Ok(value) => Ok(Some(value)),
        Err(err) if err.code == "missing_provider_key" => Ok(None),
        Err(err) => Err(err),
    }
}

fn provider_key_entry(provider_id: &str) -> Result<Entry, ProviderError> {
    Entry::new(SERVICE_NAME, &provider_key_account(provider_id)).map_err(map_keyring_error)
}

fn provider_key_account(provider_id: &str) -> String {
    format!("provider.{provider_id}")
}

fn legacy_provider_key_account(provider_id: &str) -> String {
    format!("provider:{provider_id}")
}

fn provider_config_account(provider_id: &str) -> String {
    format!("provider-config.{provider_id}")
}

fn legacy_provider_config_account(provider_id: &str) -> String {
    format!("provider-config:{provider_id}")
}

fn read_password_with_legacy(account: &str, legacy_account: &str) -> Result<String, ProviderError> {
    read_password_with_legacy_using_store(&KeyringCredentialStore, account, legacy_account)
}

fn read_password_with_legacy_using_store(
    store: &impl CredentialStore,
    account: &str,
    legacy_account: &str,
) -> Result<String, ProviderError> {
    match store.get_password(account) {
        Ok(value) => Ok(value),
        Err(KeyringError::NoEntry) => {
            let value = store
                .get_password(legacy_account)
                .map_err(|err| match err {
                    KeyringError::NoEntry => ProviderFailure::MissingCredential.into(),
                    other => map_keyring_error(other),
                })?;
            store
                .set_password(account, &value)
                .map_err(map_keyring_error)?;
            Ok(value)
        }
        Err(err) => Err(map_keyring_error(err)),
    }
}

fn map_password_read_error(error: KeyringError) -> ProviderError {
    match error {
        KeyringError::NoEntry => ProviderFailure::MissingCredential.into(),
        other => map_keyring_error(other),
    }
}

fn map_keyring_error(error: KeyringError) -> ProviderError {
    ProviderFailure::CredentialStore(error.to_string()).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    #[test]
    fn provider_credential_accounts_do_not_use_colons() {
        assert_eq!(
            provider_key_account("azure-openai"),
            "provider.azure-openai"
        );
        assert_eq!(
            provider_config_account("azure-openai"),
            "provider-config.azure-openai"
        );
    }

    #[test]
    fn legacy_provider_credential_accounts_remain_readable() {
        assert_eq!(
            legacy_provider_key_account("azure-openai"),
            "provider:azure-openai"
        );
        assert_eq!(
            legacy_provider_config_account("azure-openai"),
            "provider-config:azure-openai"
        );
    }

    #[derive(Default)]
    struct FakeCredentialStore {
        values: RefCell<HashMap<String, String>>,
        reads: RefCell<Vec<String>>,
        writes: RefCell<Vec<(String, String)>>,
    }

    impl FakeCredentialStore {
        fn with_value(self, account: &str, value: &str) -> Self {
            self.values
                .borrow_mut()
                .insert(account.to_string(), value.to_string());
            self
        }

        fn read_count(&self, account: &str) -> usize {
            self.reads
                .borrow()
                .iter()
                .filter(|value| value.as_str() == account)
                .count()
        }
    }

    impl CredentialStore for FakeCredentialStore {
        fn get_password(&self, account: &str) -> Result<String, KeyringError> {
            self.reads.borrow_mut().push(account.to_string());
            self.values
                .borrow()
                .get(account)
                .cloned()
                .ok_or(KeyringError::NoEntry)
        }

        fn set_password(&self, account: &str, password: &str) -> Result<(), KeyringError> {
            self.writes
                .borrow_mut()
                .push((account.to_string(), password.to_string()));
            self.values
                .borrow_mut()
                .insert(account.to_string(), password.to_string());
            Ok(())
        }
    }

    #[test]
    fn read_password_uses_current_account_when_present() {
        let store = FakeCredentialStore::default().with_value("provider.openai", "current-key");

        let value =
            read_password_with_legacy_using_store(&store, "provider.openai", "provider:openai")
                .unwrap();

        assert_eq!(value, "current-key");
        assert_eq!(store.read_count("provider.openai"), 1);
        assert_eq!(store.read_count("provider:openai"), 0);
    }

    #[test]
    fn read_password_migrates_legacy_value_to_current_account() {
        let store = FakeCredentialStore::default().with_value("provider:openai", "legacy-key");

        let value =
            read_password_with_legacy_using_store(&store, "provider.openai", "provider:openai")
                .unwrap();

        assert_eq!(value, "legacy-key");
        assert_eq!(
            store.writes.borrow().as_slice(),
            [("provider.openai".to_string(), "legacy-key".to_string())]
        );
    }

    #[test]
    fn repeated_reads_after_migration_skip_legacy_fallback() {
        let store = FakeCredentialStore::default().with_value("provider:openai", "legacy-key");

        let first =
            read_password_with_legacy_using_store(&store, "provider.openai", "provider:openai")
                .unwrap();
        let second =
            read_password_with_legacy_using_store(&store, "provider.openai", "provider:openai")
                .unwrap();

        assert_eq!(first, "legacy-key");
        assert_eq!(second, "legacy-key");
        assert_eq!(store.read_count("provider.openai"), 2);
        assert_eq!(store.read_count("provider:openai"), 1);
    }
}

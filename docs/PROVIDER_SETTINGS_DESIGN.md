# Provider Settings Design

## Purpose

Define the production-level settings flow for local bring-your-own-provider
transcription. This document covers the first supported speech providers:
OpenAI and Azure OpenAI.

The goal is to make provider setup obvious, testable, and hard to misconfigure.

## Current Problem

The current UI exposes multiple provider forms at the same time. This creates
three product problems:

- Selecting Azure OpenAI still shows OpenAI key errors.
- The dropdown has weak value because provider-specific setup is not scoped to
  the selected provider.
- A user cannot easily tell whether the failure is provider selection, missing
  credential, incomplete Azure config, or a real provider API failure.

This is not acceptable for the first production provider flow.

## Design Principles

- One active provider context at a time.
- Only show errors for the selected provider.
- Separate secret status from non-secret configuration status.
- Save provider setup atomically before activating it.
- Let users test a provider before relying on the floating voice capsule.
- Never expose stored API keys after save.
- No login or backend dependency for local provider setup.

## Page Structure

The Settings page should have clear sections:

```text
Settings
  Speech provider
    Provider selector
    Active provider status
    Selected provider setup panel
    Test transcription action

  App preferences
    Hotkey
    Floating capsule behavior
    Microphone device
```

For now, only the Speech provider section needs to be built.

## Speech Provider Layout

### Header

Show:

- title: `Speech provider`
- description: `Choose the service used by the floating voice capsule.`
- status badge for the selected provider only

Status badge values:

- `Ready`
- `Needs key`
- `Needs configuration`
- `Test failed`
- `Saving`
- `Testing`

Do not show `OpenAI not ready` when Azure OpenAI is selected.

### Provider Selector

Use a segmented control or provider cards instead of a plain dropdown once the
provider count is small.

Initial options:

- OpenAI
- Azure OpenAI

Each option should show:

- provider name
- short purpose
- setup state

Example:

```text
[ OpenAI          Ready      ]
[ Azure OpenAI   Needs key  ]
```

If we keep a dropdown temporarily, the selected provider panel below it must be
exclusive.

## Selected Provider Panels

### OpenAI Panel

Visible only when OpenAI is selected.

Fields:

- API key

Actions:

- Save OpenAI
- Test provider

Status details:

- `Key saved`
- `No key saved`

Validation:

- API key is required on first save.
- Empty key should not overwrite an existing saved key.
- Error messages must be scoped inside the OpenAI panel only.

### Azure OpenAI Panel

Visible only when Azure OpenAI is selected.

Fields:

- Endpoint
- Deployment ID
- API version
- API key

Actions:

- Save Azure OpenAI
- Test provider

Status details:

- `Endpoint saved`
- `Deployment saved`
- `Key saved`
- `Ready to test`

Validation:

- Endpoint is required.
- Endpoint must be a URL, usually:
  `https://your-resource.openai.azure.com`
- Deployment ID is required.
- Deployment ID must not contain `/`.
- API version defaults to `2025-04-01-preview`.
- API key is required on first save.
- Empty key should not overwrite an existing saved key.

## Save Flow

Saving a provider must be atomic from the user perspective.

```text
submit selected provider form
  -> validate fields in UI
  -> call one backend setup command
  -> backend saves non-secret config
  -> backend saves key if provided
  -> backend reads key back
  -> backend checks config completeness
  -> backend activates provider only if ready
  -> UI refreshes selected provider status
```

If any step fails, the selected provider must not be activated.

## Test Flow

Add a test action before relying on the floating capsule.

```text
click Test provider
  -> record or use a tiny local sample later
  -> send to selected provider only
  -> show result or provider-specific error
```

Initial implementation can test credential/config only. Later it should run a
real transcription request with a small bundled audio fixture.

## Error Rules

Errors must have ownership.

Provider errors:

- appear inside the selected provider panel
- include provider name only when useful
- never appear under inactive provider forms

Global errors:

- secure storage unavailable
- Tauri runtime unavailable
- app-level permissions failure

Examples:

```text
Azure OpenAI key is not saved.
Azure OpenAI endpoint is required.
Azure OpenAI returned 401: invalid API key or deployment.
```

Avoid raw internal messages as the primary UI copy:

```text
missing_provider_key: provider API key is not configured
```

This can be logged or shown in diagnostics later, but Settings should show
human-readable recovery text.

## Visual Direction

The Settings page should feel like a desktop preferences panel:

- compact spacing
- one main column
- no nested card stacks
- selected provider panel with a single border
- muted helper text
- clear primary action
- no red borders on unrelated fields

Use warning styling only for the exact field or panel that needs attention.

## Implementation Requirements

- Settings state should store errors by provider id.
- The selected provider determines which panel renders.
- Provider status should return separate booleans:
  - has key
  - config complete
  - active provider
- Azure save must use the atomic backend setup command.
- The floating capsule should read only the active provider.
- The floating capsule should not transcribe until provider loading is complete.

## Acceptance Criteria

- Selecting Azure OpenAI hides the OpenAI API key form.
- Selecting OpenAI hides the Azure OpenAI fields.
- Saving Azure OpenAI with endpoint, deployment, API version, and key changes
  the badge to `Ready`.
- If Azure key save fails, Azure is not activated.
- The floating capsule uses the same active provider shown in Settings.
- No inactive provider error is visible.
- No raw API key is displayed after save.
- A user can recover from a missing key without restarting the app.

## Next Build Step

Refactor `SettingsPanel` into provider-specific panels:

```text
SettingsPanel
  SpeechProviderSettings
    ProviderSelector
    OpenAiProviderPanel
    AzureOpenAiProviderPanel
```

This should happen before adding more providers, otherwise every new provider
will multiply the current UI confusion.

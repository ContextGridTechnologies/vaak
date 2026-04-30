# Open-Source Product Baseline

## One-Sentence Positioning

Vaak is an open-source voice layer for desktop work: speak once, get polished
text, and insert it into the app you were already using.

## Public Positioning

Use this framing in external material:

> Open-source voice tooling for desktop workflows. Local-first by default,
> bring-your-own-model when you want control, managed cloud when you want
> convenience.

Avoid reactive market framing. Vaak should lead with its own category and
values.

Detailed messaging rules live in `docs/POSITIONING.md`.

## Product Principles

- Local-first by default.
- No account required for core usage.
- Bring-your-own-model support from the first useful release.
- Optional backend for sync, managed usage, billing, and teams.
- Trust and privacy are product features, not legal footnotes.
- The app must be useful as a desktop tool before it becomes a platform.

## Open-Source Scope

The open-source product should include:

- Desktop app.
- Microphone recording.
- Focused-field detection.
- Text insertion.
- BYO transcription providers.
- BYO rewrite/model providers.
- Local dictionary.
- Local snippets.
- Local rewrite styles.
- Provider extension interfaces.
- Local import/export.

The open-source app should not require:

- Login.
- Hosted Vaak backend.
- Paid subscription.
- Server-side API keys.

## Paid Cloud Scope

Paid cloud features should be convenience and collaboration layers:

- Managed transcription.
- Managed rewrite models.
- Account sync.
- Cross-device settings.
- Team dictionary.
- Team snippets.
- Usage dashboard.
- Central billing.
- Admin controls.
- Priority support.

## What We Are Not Building First

- A forced-SaaS dictation app.
- Enterprise dashboards before individual value works.
- Mobile apps before desktop reliability.
- A generic chatbot.
- A full offline local-model stack as the default path.
- A reactive brand position.

## Market Wedge

Vaak should win on:

- Open-source trust.
- BYO model freedom.
- Local-first privacy.
- Developer extensibility.
- Lower cost for users who already have provider keys.
- Paid convenience for users and teams who do not want setup work.

## Messaging Pillars

### Control

Users choose their providers, models, and data path.

### Privacy

Core usage works locally without a Vaak account.

### Workflow

Speech becomes useful text inside the app the user is already using.

### Extensibility

Developers can add providers, local models, and workflow integrations.

### Business Readiness

Teams can later pay for sync, managed usage, shared vocabulary, admin controls,
and support.

## Business Baseline

Free users should not create ongoing API cost unless they opt into a limited
managed trial. BYO users pay providers directly.

Paid users create revenue through:

- Hosted model usage.
- Sync.
- Teams.
- Admin/security controls.
- Support.

Profitability depends on usage controls. Managed plans need fair-use limits,
metering, abuse controls, and provider routing that preserves gross margin.

## First Product Promise

A user can install Vaak, add their own AI provider key, press a hotkey, speak,
and have polished text inserted into the app they were already using.

## First Experience Rule

The first screen should show local mode, setup progress, provider choices, and
the main dictation action. Login and managed cloud can be visible as future or
secondary paths, but they must not block local BYO setup.

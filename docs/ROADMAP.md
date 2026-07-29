# Vaak Roadmap

This is the active roadmap. Older planning documents were retired to avoid
conflicting direction.

For public messaging, use `docs/POSITIONING.md`.

## Product Direction

Vaak is an open-source voice layer for desktop work. It turns speech into
polished text and places that text into the app the user is already using.

The product must work without login. Users can bring their own transcription
and model providers. Paid cloud features are optional and should add
convenience, sync, managed usage, and team controls.

## Market Position

Vaak should be positioned as voice infrastructure for people who want control:

- open-source voice tooling for desktop workflows
- local-first dictation and rewrite
- bring-your-own-model by default
- optional managed cloud when users want convenience
- team vocabulary and workflow controls when organizations need governance

Public-facing planning, README copy, website copy, and release notes should
lead with Vaak's own category, values, and user outcomes.

## Strategic Goal

Build a profitable open-core voice product:

- Open-source desktop app for trust, adoption, and developer distribution.
- Bring-your-own-model support to keep free-user API costs near zero.
- Paid managed cloud for users and teams who want setup-free usage.
- Teams and enterprise features after the single-user product is strong.
- A clear public story: user-controlled voice input for every desktop app.

## Non-Negotiables

- No forced login for the local app.
- BYO provider keys stay local by default.
- Backend is optional until sync or managed usage is enabled.
- Dictation must insert text into real focused apps, not only into Vaak.
- The first product must be useful before command mode, teams, or billing.

## Active Milestones

### Milestone 1: Local BYOM Dictation Foundation

Status: mostly built, closeout in progress.

Goal: make the app useful without login or backend on the primary desktop path.

Current state:

- First-run onboarding for local mode is implemented.
- Microphone readiness, provider setup, and hold-to-talk verification are implemented.
- Local speech-provider settings and secure local API key storage are implemented.
- Speech adapters are implemented for OpenAI, Azure OpenAI, AssemblyAI,
  ElevenLabs, and Smallest AI.
- Hold-to-talk capture and manual floating voice capsule capture are implemented.
- Focus capture and guarded text insertion into the original target are implemented
  on Windows.
- Local dictation records, audio artifacts, and activity history are implemented.
- No Vaak backend account is required for the local dictation path.

Closeout work:

- Finish the transcript cleanup/rewrite stage behind the provider boundary.
- Tighten quality and recovery across more real target apps and edge cases.
- Align the shipped provider set with the public provider roadmap.
- Package the current Windows build clearly enough for wider developer testing.

Exit criteria:

- A user can check out the repo, run the desktop app, complete onboarding, add
  their own provider key, dictate into another app, and see reliable text
  inserted without any Vaak account.
- The app exposes clear states for recording, transcription, insertion, and
  recoverable failure.

### Milestone 2: Quality And Personalization

Goal: make Vaak meaningfully better than raw transcription while staying local-first.

Deliverables:

- Transcript cleanup/rewrite through a selected model.
- Personal dictionary.
- Snippets.
- Rewrite styles.
- App-aware prompt context where technically available.
- Local import/export for settings.

Exit criteria:

- Dictation output respects user vocabulary, names, snippets, and preferred
  writing style.
- Users can choose between direct transcript insertion and a more polished
  rewrite path.

### Milestone 3: Open-Source Launch Readiness

Goal: make the project credible for public users and contributors.

Deliverables:

- Clear README and setup path.
- License and contribution guide.
- Security and privacy documentation.
- Provider extension guide.
- CI for lint, typecheck, tests, and builds.
- Signed or clearly packaged developer builds when feasible.

Exit criteria:

- A developer can install, run, understand the architecture, and add a provider
  without private context.

### Milestone 4: Optional Account And Sync

Goal: add login only where it creates value.

Deliverables:

- Optional auth.
- Device sessions.
- Sync for dictionary, snippets, style presets, and non-secret settings.
- Conflict handling.
- Account deletion/export.

Exit criteria:

- Local-only users are unaffected.
- Signed-in users get useful cross-device persistence.

### Milestone 5: Managed Cloud Monetization

Goal: make the business profitable without undermining open-source trust.

Deliverables:

- Managed transcription and rewrite endpoints.
- Usage metering.
- Stripe billing.
- Free trial or limited free managed usage.
- Prepaid managed credits with explicit usage and cost limits.
- Cost controls and abuse prevention.

Exit criteria:

- Paid users can use Vaak without provider keys.
- Gross margin remains healthy under normal usage.

### Milestone 6: Teams

Goal: monetize higher-value collaborative use cases.

Deliverables:

- Shared dictionary.
- Shared snippets.
- Central billing.
- Admin seats.
- Usage dashboard.
- Basic policy controls.

Exit criteria:

- A small team can standardize dictation vocabulary and pay centrally.

## Pricing Direction

Initial open-core pricing target:

- Free: local app, BYO keys, local settings.
- Managed: optional transcription credits at a target rate of `$1 per 60
  minutes`, sold in practical top-up packs without automatic renewal.
- Team: shared vocabulary, central billing, dashboards, and admin controls.

Avoid unlimited managed usage without fair-use limits. Transcription costs can
be low per normal user, but heavy users can erase margin if plans are not
metered or bounded.

## Current First Step

Close out Milestone 1 from the working Windows desktop baseline:

- onboarding, provider setup, hotkey capture, floating voice capsule, local
  activity history, transcription, and guarded insertion are already in place
- next focus is reliability, rewrite-stage completion, and packaging the
  current Windows experience for broader testing before expanding native support

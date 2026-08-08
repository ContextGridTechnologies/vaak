# MCP Platform Architecture

## Status and Scope

This is the production design for adding Model Context Protocol (MCP)
connectors to Vaak. The first Windows vertical slice is implemented; later
catalog execution and remote-transport phases remain future work. The reviewed
candidate metadata now lives in [MCP_REGISTRY.md](MCP_REGISTRY.md) and the
bundled registry JSON; metadata does not make an entry executable.

FlaUI-MCP is the first curated Windows connector. The same platform must later
support multiple connectors, multiple agents, remote MCP servers, and native
Windows and macOS adapters. AssemblyAI remains the current voice transport and
reasoning provider, not the owner of local permissions.

## Implemented Windows Vertical Slice

The current code implements the first reviewed local connector end to end:

- a top-level MCPs screen with separate install, enable, Voice Agent binding,
  per-tool grant, health-test, and skill controls;
- a versioned bundled registry with one installable connector and explicit
  candidate/deferred statuses for future adapters;
- a pinned FlaUI-MCP v0.2.0 self-contained x64/ARM64 artifact, verified by
  SHA-256 before atomic per-user extraction;
- a separate `mcp-state.sqlite` with explicit schema versions, uninstall
  tombstones, agent bindings, tool policies, schema hashes, and skill bindings;
- the official Rust MCP SDK over stdio, with lazy per-agent-session processes,
  bounded startup/call timeouts, and deterministic process cleanup;
- Rust-owned opaque AssemblyAI tool aliases, immutable expiring snapshots,
  replay protection, schema-change invalidation, and execution-time grant
  checks;
- one-time approval challenges for `ask` grants in the main Voice Agent screen
  and floating capsule;
- explicit Tauri command permissions per WebView. The capsule can execute its
  own session but cannot manage connectors or grants;
- live conformance coverage against the downloaded FlaUI binary, including
  discovery of the reviewed 12-tool surface and a real `windows_list_windows`
  call.

`windows_batch` and `windows_close` remain visible but blocked in this slice.
Handle-based snapshot/focus paths are rejected, Vaak windows are excluded from
discovery, and tools that act on the foreground window fail closed when the
target cannot be verified.

### Local Test

```powershell
npm --prefix apps/desktop run tauri:dev
```

On the first Windows run, the command downloads the pinned FlaUI archive into a
gitignored build cache, verifies it, and bundles it for Tauri. In the app:

1. Open **MCPs**. Confirm **Windows Desktop (FlaUI)** is Installed.
2. Enable it, attach it to **Voice Agent**, and grant only the tools needed.
   Use **Always allow** for hands-free calls or **Ask every time** to exercise
   the approval UI.
3. Select **Test connection**; the page should report `Ready · 12 tools
   discovered`.
4. Open **Voice Agent**, select **Start voice agent**, and ask it to list open
   windows. For a write test, open Notepad and grant snapshot plus the required
   click/type tools before asking the agent to interact with it.

Focused native verification commands:

```powershell
npm --prefix apps/desktop test
npm --prefix apps/desktop run typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml `
  mcp::runtime::tests::live_pinned_flaui_runtime_reports_the_reviewed_tool_surface `
  --lib -- --ignored --nocapture
```

## Requirement Coverage

| Requested outcome | Architecture evidence |
| --- | --- |
| Separate MCPs section | Product Experience defines Installed, Discover, and Issues |
| FlaUI available after startup/login | Default FlaUI Provisioning reuses Vaak autostart and reconciles a bundled artifact |
| Users can install from a list | Curated Catalog and connector actions define reviewed installation |
| Installed MCPs attach to agents | Agent and Binding UX plus Bindings and Tool Snapshots define explicit many-to-many attachment |
| Lists of tools and skills | Connector Tools and Agent Skills views are defined separately |
| Multiple MCPs at production scale | Stable identities, supervised runtimes, bounded capacity, failure isolation, and updates are defined |
| Loopholes reviewed before code | Threats and Controls, Architecture Review Checklist, and Verification Strategy are release gates |

## Decisions

1. Vaak is an MCP host and manager, not a general-purpose MCP server.
2. Rust owns catalog, installation, lifecycle, MCP sessions, credentials,
   policy, approvals, audit, and execution. The WebView owns presentation.
3. FlaUI-MCP may be provisioned during app-start reconciliation, but remains
   disabled and stopped until the user enables it and grants selected tools.
4. Installed, enabled, running, attached, and authorized are separate states.
5. A connector is installed once per operating-system user profile. Agents
   receive scoped bindings; binaries are not duplicated per agent or shared
   across Windows users.
6. The native create-folder tool stays native and moves behind the same Rust
   broker without changing its validation.
7. Version 1 supports local standard-I/O MCP servers only. Remote Streamable
   HTTP is deferred because it adds OAuth, SSRF, network, and tenancy risk.
8. Use the official Rust MCP SDK and protocol negotiation. Do not hand-write
   JSON-RPC or hardcode one protocol date.
9. A public MCP registry is discovery input, not a trusted app store. Only a
   reviewed Vaak catalog drives one-click installation.
10. Only MCP tools execute in version 1. Resources, prompts, and Vaak skills
    have separate trust and permission rules.

## Non-Negotiable Invariants

- Installing a connector never grants a tool.
- Enabling a connector never starts it permanently.
- Login and app startup never launch FlaUI-MCP.
- A process starts lazily only for an authorized agent session and stops when
  unused.
- An agent can access only explicitly bound connectors and granted tools.
- Every call belongs to an immutable, revisioned session tool snapshot.
- Provider-visible tool names are opaque aliases. Rust resolves the connector,
  tool, schema, agent, grant, and policy revision.
- UI events are not authorization. Rust revalidates every command.
- Connector output, UI text, screenshots, prompts, and schemas are untrusted.
- Secrets live in the OS credential store; SQLite holds references only.
- One connector failure cannot disable dictation, voice, or other connectors.

## Terms and State Boundaries

| Term | Meaning |
| --- | --- |
| Catalog entry | Reviewed metadata for an available connector |
| Installation | A verified connector version in the current user profile |
| Enabled | The connector may be considered for use |
| Runtime | One supervised process and MCP session |
| Agent binding | An agent is linked to an enabled connector |
| Tool grant | A specific tool and optional argument scope are permitted for a binding |
| Tool snapshot | Immutable aliases and grants exposed to one session |
| Approval | User consent for one call or a bounded policy |
| Skill | Versioned instructions that may require tools but grant none |

~~~text
catalog entry
  -> installed
  -> enabled
  -> attached to agent
  -> selected tools granted
  -> session snapshot
  -> connector lazily started
  -> authorized call
~~~

Skipping any transition is an authorization failure, not an automatic repair.

## Product Experience

Add a top-level MCPs item beside Voice Agent. One page can initially provide
Installed, Discover, and Issues filters.

The implemented catalog/card/detail interaction and the requirements for adding
connector number two are documented in [MCP_CATALOG_UI.md](MCP_CATALOG_UI.md).

Each connector view shows:

- publisher, source, license, version, platform, architecture, and trust source;
- artifact digest, signing status, and last verification;
- install, enable, runtime, health, quarantine, and update states;
- tools with descriptions, input shapes, risk, and grant state;
- attached agents, pending approvals, redacted activity, and errors.

Actions are Install, Enable, Disable, Update, Uninstall, Attach agent, Detach
agent, and Edit tool grants. Voice Agent shows an Attached MCPs summary and
links to this editor; it does not implement a second manager.

### Agent and Binding UX

Create one stable built-in agent, Voice Agent, during migration. Future custom
agents use the same records and broker; provider choice is agent configuration,
not connector configuration.

Installation ends with an optional Choose agents step. Skipping it leaves the
connector installed-disabled. Attaching shows the connector's reviewed tool
list with no tools selected by default. The user chooses tools and supported
scopes, then explicitly enables the binding. Deleting an agent detaches its
bindings and invalidates sessions but does not uninstall shared connectors.

The agent detail view contains:

- Attached MCPs: connector state and attach/detach controls;
- Granted Tools: effective risk, constraints, and approval mode;
- Skills: installed skills, missing tool requirements, version, and enable
  state.

This makes connectors available to agents without making installation itself
an implicit authorization event.

### Default FlaUI Provisioning

FlaUI-MCP appears in the reviewed catalog on supported Windows devices. A
non-blocking reconciler runs on first start and after app updates:

1. Read desired state and any uninstall tombstone.
2. Verify platform, architecture, manifest, and artifact digest.
3. Extract to staging with traversal, symlink, and junction protection.
4. Apply per-user permissions and verify the executable layout.
5. Atomically activate the versioned directory.
6. Record installed-disabled.

It is not enabled, attached, granted, or started automatically. An uninstall
tombstone prevents reinstall on the next login until the user chooses Restore
default connector. Reconcile failures appear under Issues and never block Vaak
startup.

Reuse Vaak's existing app autostart. Do not create a connector service,
scheduled task, or second login item. Bundle FlaUI's self-contained multi-file
archive as a Tauri resource inside the signed app package, then install it into
versioned per-user app data. Record its third-party license and notices in the
catalog. Future connectors that require external runtimes must declare and
check them; Vaak must not silently invoke a package manager.

## Runtime Topology

~~~text
React/WebView
  AssemblyAI duplex session
  MCP management UI
         |
         | typed Tauri commands and redacted events
         v
Rust/Tauri core
  Agent Tool Broker
    Policy and Approval Engine
    Binding and Tool Snapshot Store
    Native Tool Adapter ----------> create_folder
    MCP Session Supervisor
      MCP client ------------------> FlaUI-MCP child process
      MCP client ------------------> future local MCP process
      remote adapter --------------> future Streamable HTTP MCP
      platform adapter ------------> future Windows ODR or macOS APIs
  Installation Manager
  Credential Broker
  Audit Store
~~~

The provider receives aliases and schemas. It never receives connector paths,
credentials, process handles, raw MCP access, or unrestricted command
execution.

## Rust Ownership

These are logical boundaries, not a request for one abstraction per bullet.

### Curated Catalog

- Read a signed-format, app-shipped manifest.
- Apply OS, architecture, minimum Vaak version, and compatibility rules.
- Allow remote catalog refresh only after signature, expiration, rollback, and
  release-channel policies exist.
- Import public-registry entries only into a review queue.

Stable connector IDs use a publisher-controlled reverse-domain namespace and
never derive from display names. Each release declares semantic version,
minimum Vaak version, supported OS/architectures, transport, executable entry
point, complete artifact file digests, license, source/provenance, reviewed
tools, and security minimum. Stable tool IDs combine connector ID and canonical
tool name; provider aliases remain session-specific.

Trust tiers are Built-in, Vaak Verified, and Advanced Local. Only Built-in and
Vaak Verified entries support normal one-click installation and updates.
Advanced Local is a future developer mode with explicit warnings, no automatic
trust inheritance, and no default agent binding. Public-registry presence does
not assign a trust tier.

The embedded catalog is trusted through the signed Vaak application package.
A future network catalog requires an embedded root key, signed sequence number,
expiry, rollback prevention, key rotation, and revocation before it can update
installable metadata.

### Installation Manager

- Own desired and actual state.
- Install only declared artifacts at fixed versioned paths.
- Verify digest before extraction and activation.
- Make install, repair, update, rollback, and uninstall crash-safe and
  idempotent.
- Honor uninstall tombstones.
- Rely on Vaak's existing single-instance startup guard and additionally hold a
  per-user installation file lock across reconcile, install, update, repair,
  activation, and uninstall so updater or recovery races fail safely.

### Runtime Supervisor

- Start a fixed absolute executable without a shell or PATH lookup.
- Use a fixed working directory and minimal sanitized environment.
- Own standard streams, deadlines, cancellation, output limits, backoff, and
  idle shutdown.
- Treat standard output as MCP protocol only; standard error is bounded and
  redacted diagnostics.
- Reverify the complete artifact manifest immediately before each launch so a
  replaced executable or supporting DLL is quarantined before execution.
- On Windows, use a Job Object so descendants cannot outlive Vaak.

### MCP Client

- Use the official Rust SDK pinned by Cargo.lock.
- Perform initialize, capability and version negotiation, operation, and clean
  shutdown.
- Handle paginated discovery and tool-list-changed notifications.
- Bound schema, request, response, and diagnostic sizes.
- Advertise only implemented client capabilities. Version 1 rejects server
  requests for sampling, elicitation, roots, or other host callbacks.
- Run a small conformance check against the pinned SDK and FlaUI version.

### Agent Tool Broker

- Be the only execution entry for native and MCP tools.
- Resolve opaque aliases against the session snapshot.
- Validate arguments against the snapshotted schema.
- Recheck installation, binding, grant, policy, and approval at execution time.
- Enforce grant constraints such as allowed applications, operations, path
  roots, domains, or argument patterns where a curated tool supports them.
- Enforce deadline, cancellation, concurrency, output limit, and redaction.
- Mint a short-lived session handle in Rust when issuing the provider's
  temporary voice credential. Bind it to the agent, window instance, provider
  session, and expiry; never trust a caller-supplied agent identity.
- Return a provider-independent normalized result.

### Policy and Approval Engine

- Assign risk from Vaak policy, never from connector marketing text.
- Support deny, per-call confirmation, session allow, and future device policy.
- Preview the exact target and action before confirmation.
- Bind approval to the snapshot, schema hash, normalized arguments, target,
  action, and a short expiry; recheck the precondition immediately before use.
- Never let a batch tool bypass approval for child actions.
- Record the policy revision with each decision.

### Approval Channels

Low-risk, explicitly granted calls can remain hands-free. Moderate actions may
use voice confirmation only when Rust has created one pending, short-lived
challenge and the agent reads back the exact application, target, action, and
effect. A dedicated confirmation response can approve only that challenge; it
is not a general tool grant.

External, destructive, financial, credential, permission-changing, or
otherwise high-impact actions require visible confirmation until Vaak has a
separately reviewed user-presence and speaker-verification design. The product
must say this honestly: hands-free is the normal path, not a reason to remove
the last safety boundary.

FlaUI is always denied access to Vaak's approval surface, MCP settings,
credential UI, updater, and permission controls. An agent cannot approve
itself by clicking the confirmation window.

### Credentials and Audit

- Put secrets in the OS credential store and issue scoped values only at
  runtime.
- Never put secrets in arguments, environment dumps, schemas, catalogs, logs,
  or provider-visible errors.
- Audit connector, agent, tool, risk, decision, duration, result class, and
  redacted error.
- Do not record typed text, window text, screenshots, raw arguments, or full
  results by default. Provide retention controls and Clear activity.

## Persistence

Reuse the installed rusqlite dependency with a separate mcp-state.sqlite and
explicit migrations. WebView storage is never authoritative.

Conceptual records:

- catalog_entries: stable ID, release metadata, trust and platform rules;
- installations: desired and actual state, version, path, digest, health,
  error, last-known-good version, and tombstone;
- discovered_tools: connector/version/tool IDs, normalized schema hash, risk,
  and review state;
- agents and agent_connector_bindings;
- agent_tool_grants: stable tool ID, policy, constraints, and schema hash;
- session_snapshots: agent, revision, aliases, grants, and expiry;
- credential_refs: credential-store references, never values;
- runtime_events and audit_events: bounded operational history.

Writes use transactions. Filesystem and database activation use a recoverable
journal so the next startup deterministically repairs an interrupted install.

Before migration, create a database backup and run an integrity check. On
corruption, move the database aside, reconstruct catalog and verified
installation facts from manifests, and fail closed on bindings, grants,
approvals, and credentials. Never infer authorization from files found on
disk.

## Bindings and Tool Snapshots

Bindings are many-to-many. One installation can serve multiple agents and one
agent can use multiple connectors. For FlaUI version 1, use one runtime per
active agent session because desktop references are session-sensitive. Pooling
can follow only after safe concurrent-client behavior is proven.

At session start:

1. Load active bindings and explicit grants.
2. Start only required connectors.
3. Initialize MCP sessions and enumerate every tool page.
4. Validate schemas and compare hashes with reviewed grants.
5. Apply risk, compatibility, tool-count, and schema-size budgets.
6. Namespace collisions and create provider-safe aliases.
7. Persist an immutable expiring snapshot and send the complete tool set to
   AssemblyAI.

AssemblyAI can receive a replacement tool configuration after the session is
ready. Send complete snapshots, not incremental guesses.

Provider calls include agent_session_id, snapshot_revision, tool_alias,
arguments, and provider_call_id. Rust rejects unknown, expired, replayed, stale,
or mismatched calls.

On a tool-list change, finish or cancel in-flight work, rediscover, and create a
new snapshot. A schema-hash change disables the tool until review; an update
cannot silently turn a read tool into a write tool.

## Tools, Resources, Prompts, and Skills

### MCP Tools

Only explicitly granted tools execute. Vaak supplies reviewed names, risk, and
confirmation text for curated tools instead of trusting server wording.

### MCP Resources

Disabled in version 1. Later read-only context requires URI allowlists, MIME
and size limits, freshness, redaction, and prompt-injection handling.

### MCP Prompts

Untrusted suggestions, never silent system instructions. They may later appear
as user-selected templates with provenance.

### Vaak Skills

A skill is a versioned instruction bundle that can declare required stable tool
IDs and compatibility constraints. Agents and skills are many-to-many.

A skill cannot install, enable, attach, grant, suppress approval, read a
credential, or override policy. Missing requirements make it unavailable with
an explanation.

Version 1 skills are declarative manifest plus text instructions only: no
scripts, native libraries, dynamic imports, network fetches, or embedded
secrets. They have stable publisher-controlled IDs, version, content digest,
source, license, minimum Vaak version, declared tool requirements, and optional
requested context. System safety policy and user instructions always outrank
skill text.

Skills use the same Built-in and Vaak Verified catalog trust model but have
their own install, update, attach, enable, disable, and remove state. An update
that changes instructions, requested context, or tool requirements shows a
diff and requires review before activation. Removing a skill affects no
connector installation or tool grant.

## Initial FlaUI Risk Policy

| Tool or class | Risk | Version 1 policy |
| --- | --- | --- |
| list_windows | Sensitive read | Session grant; redact titles in logs |
| snapshot | Sensitive read | Session grant; bound tree depth and size |
| get_text | Sensitive read | Confirm when target may contain secrets |
| screenshot | Sensitive capture | Confirm every capture |
| focus | Reversible action | Session grant |
| windows_launch | External action | Confirm executable and arguments |
| click | Consequential action | Confirm submit, purchase, or external effects |
| type, fill, send_keys | Consequential | Read back target and text class; never log text |
| close | Data-loss risk | Confirm unless known clean |
| windows_batch | Composite risk | Disabled until child policy is enforced |

Tool name is insufficient for risk. The broker may escalate based on target,
control role, arguments, and detected effect, but never downgrade below policy.

Initially expose curated semantic wrappers instead of every raw FlaUI action.
Each mutation observes a precondition, performs one action, and verifies a
postcondition. Vision or coordinate fallback remains a separate higher-risk
capability.

## Lifecycle

~~~text
Installation:
catalog_only -> installing -> installed_disabled -> enabled -> updating
installing/updating -> error
enabled/error -> quarantined
any installed state -> uninstalling -> catalog_only plus tombstone

Runtime:
stopped -> starting -> initializing -> ready -> stopping -> stopped
initializing/ready -> degraded/crashed -> backoff or quarantined
~~~

Unexpected exits use bounded exponential backoff. Three crashes in ten minutes
is the initial configurable quarantine threshold and must be tuned from data.
Quarantine requires explicit retry or a verified update.

Disable rejects new calls, cancels queued calls, drains one active call for a
short bounded period, then terminates. Uninstall disables, invalidates
snapshots, stops every runtime, removes the activated version, and retains the
catalog entry and tombstone.

If Windows still holds a file handle, record pending removal and retry after
the process exits or on the next app start. Never report Uninstalled while any
executable artifact remains active.

## Updates and Rollback

- Never replace a binary in place.
- Verify before extraction, then extract to a new staging directory.
- Initialize and inspect tools without attaching an agent.
- Compare tool IDs and schema hashes; require review for changed capability.
- Activate only when the old version has no active session.
- Keep one last-known-good version until a healthy real session completes.
- Roll back after activation failure or repeated startup crashes.
- Never silently downgrade below a security minimum.

App updates and connector updates are separate state machines. A connector
update failure does not roll back the app.

## Threats and Controls

| Threat | Control |
| --- | --- |
| Replaced artifact | Curated source, pinned version, digest, provenance, signing |
| Archive traversal | Reject absolute, parent, symlink, junction, and alternate-stream targets |
| Arbitrary exec or DLL loading | Fixed executable and cwd, sanitized environment, restricted path |
| Tool poisoning or rug pull | Schema hashes, reviewed metadata, grant invalidation |
| Prompt injection in results | Treat returned content as data, never policy |
| Cross-agent confused deputy | Session aliases, immutable snapshots, binding recheck |
| Agent automates its own approval | Exclude Vaak and security surfaces from automation targets |
| Credential exfiltration | Scoped broker; no argv, logs, or provider exposure |
| Batch approval bypass | Disable batch or authorize every child |
| Hang, flood, or crash | Deadlines, bounds, backpressure, circuit breaker, process kill |
| Orphan process | Job Object and supervisor-owned handles |
| Sensitive audit trail | Metadata-only default, redaction, retention controls |
| Remote SSRF/token misuse | Defer remote v1; later endpoint, redirect, DNS, and OAuth audience policy |
| Removal while active | Revoke, drain or cancel, stop, then remove |

FlaUI requires the interactive Windows desktop, so OS containment is limited.
Verified packaging, least tool privilege, approvals, supervision, and visible
state are release requirements. Vaak and bundled artifacts must be code-signed
for production. If a third-party artifact cannot be reproduced, reviewed,
pinned, and verified, do not provision it automatically.

Run FlaUI unelevated. Never bypass UAC, automate the secure desktop, or relaunch
Vaak as administrator for convenience. Elevated applications remain
unavailable and must return a clear access error. Stop automation when Windows
locks, the interactive session changes, or the target desktop disappears.

Desktop mutations also have a human-race problem: the user can move focus or
change a control between observation and action. Bind each operation to the
expected process, window, control identity, and observed state. Abort on
unexpected focus, target, or state change, and verify the postcondition before
reporting success.

## Capacity and Failure Isolation

- Start only connectors bound to the active agent.
- Allow one in-flight call per FlaUI runtime initially.
- Bound connector count, tools, schema bytes, input, output, queue, and time.
- Use lazy startup, idle shutdown, cancellation, and backpressure.
- Isolate crash budget and circuit breaker per connector.
- Cache reviewed metadata by version but negotiate every runtime session.
- Expire aliases and UI element references.

Exact limits belong in configuration and tests after real-device measurement.
Document the ceiling and upgrade path beside any simple global lock or
serialized queue.

A failed connector becomes unavailable with a useful error. The voice session
continues without it, and dictation remains unaffected.

Future account or team sync may sync catalog IDs and desired bindings. It must
not sync local paths, secrets, screenshots, grants, or approvals without an
explicit device policy and user action.

## Cross-Platform Plan

- Windows now: reviewed FlaUI-MCP for semantic UI Automation.
- Windows later: ODR adapter when Windows build support, API stability,
  containment, and tool coverage fit Vaak users.
- macOS later: reviewed native Accessibility, App Intents, or MCP adapter with
  explicit permission UX and signing/notarization.
- Linux later: accessibility and portal adapter after defining a desktop
  support matrix.

Do not force every native capability through MCP. Small safety-critical tasks
such as create_folder are simpler as native Rust tools behind the same broker.

## Tauri IPC Boundary

Main-window-only management commands:

- list_mcp_catalog, list_mcp_installations;
- install_mcp, enable_mcp, disable_mcp, update_mcp, uninstall_mcp;
- list_agents, list_agent_bindings, update_agent_binding;
- update_agent_tool_grants, respond_to_tool_approval.

The voice surface receives only:

- create_agent_tool_snapshot;
- execute_agent_tool;
- respond_to_voice_approval;
- release_agent_tool_snapshot.

The voice surface passes only the Rust-minted session handle, snapshot revision,
alias, and arguments. Rust also checks the invoking window and current provider
session. The surface cannot select an agent identity, install, enable, attach,
grant, read credentials, choose an executable, or call an unaliased tool.
respond_to_voice_approval can resolve only the one pending moderate-risk
challenge bound to that same session; high-risk approval stays main-window
only.

Progress, health, tool changes, and approvals use typed Tauri events. Events
grant no authority. MCP standard streams never enter the WebView. Capability
files scope every command to the smallest window set, and MCP support does not
weaken WebView content security policy.

Registered app commands are broad by default in Tauri. Implementation must
declare MCP commands in the Tauri app command manifest, generate explicit
allow permissions, and grant them only in the main or voice-capsule capability
as listed above. Keep Rust's invoking-window and session checks as
defense-in-depth.

Rust resolves the bundled connector archive through Tauri's resource path API.
Neither WebView receives filesystem access to the archive or installation
directory, and neither receives shell execute or spawn permission.

## Observability and Privacy

Structured events include install, activation, runtime start/ready/crash/stop,
tool-list change, snapshot create/invalidate, tool requested/approved/denied/
completed/timed-out, quarantine, and rollback.

Log stable IDs, duration, sizes, transitions, and redacted error classes. Do
not log raw audio, transcripts, typed or window text, screenshots, arguments,
results, credentials, tokens, or environment dumps by default.

The UI distinguishes Not installed, Disabled, Starting, Ready, Needs approval,
Incompatible, Update failed, Crashed, and Quarantined.

## Verification Strategy

Every phase leaves the smallest runnable check that proves its new boundary:

- unit tests for state transitions, grant constraints, alias expiry, replay
  rejection, risk escalation, redaction, and migration;
- installer tests for interruption, lock contention, corrupt digests, archive
  traversal, junctions, locked files, tombstones, activation, and rollback;
- an in-process fake MCP server for lifecycle, pagination, malformed protocol,
  list changes, forbidden callbacks, oversized output, timeout, and crash;
- provider contract tests proving a complete AssemblyAI tool snapshot and that
  only Rust-minted session calls execute;
- frontend tests for MCP navigation, install states, bindings, grants, skills,
  approval display, accessibility, and errors;
- Windows VM tests for Job Object cleanup, lock/session change, unelevated
  behavior, x64/arm64 packaging, install/update/uninstall, and app restart;
- a dedicated interactive Windows automation smoke suite for supported apps;
  headless UI tests do not prove real UI Automation behavior.

Security-critical failure tests are fail-closed. A test that only checks a
happy response is not evidence that a permission boundary works.

## Release Gates

- The Windows app and bundled connector resources are code-signed.
- Tauri update artifacts and public-key verification are enabled before any
  remote app or catalog update channel is called production.
- FlaUI source/version, complete digest manifest, license notices, and software
  bill of materials are reviewed for every bundled release.
- Supported Windows versions and x64/arm64 artifacts pass clean-install,
  upgrade, rollback, uninstall, and locked-screen tests.
- The default connector remains installed-disabled after first reconciliation.
- No WebView capability grants arbitrary filesystem, resource, shell, process,
  or connector-standard-stream access.
- Threat-model and privacy copy ship with the feature, including the limits of
  interactive-desktop containment and hands-free approval.

## Delivery Plan

### Phase 1: Common Tool Broker

- Define a small normalized native/MCP contract in Rust.
- Route create_folder through it with unchanged validation and focused tests.
- Replace frontend execution authority with opaque aliases and a Rust snapshot
  initially containing only create_folder.

Acceptance: the folder flow works; stale, replayed, unknown, absolute, and
parent-traversing calls fail.

### Phase 2: State, Catalog, and Read-Only UI

- Add database migrations and repositories.
- Ship a local catalog with FlaUI metadata.
- Add MCPs, connector Tools, agent-binding, and Skills views without install
  mutation.

Acceptance: Rust-owned supported, incompatible, installed, desired, and error
states render correctly.

### Phase 3: Verified FlaUI Provisioning

- Package one pinned build per supported Windows architecture.
- Add crash-safe reconcile, verification, tombstone, repair, and uninstall.
- Keep it installed-disabled and stopped.

Acceptance: startup is idempotent; partial or corrupt artifacts never activate;
uninstall survives restart; failure never blocks Vaak.

### Phase 4: MCP Client and Supervision

- Add the official Rust SDK and standard-I/O lifecycle.
- Add Job Object cleanup, health, pagination, bounds, cancellation, backoff,
  and quarantine.
- Expose read-only FlaUI tools through curated aliases.

Acceptance: stdout contamination, oversized messages, hangs, crashes, and
descendant processes are contained in tests.

### Phase 5: Bindings and Dynamic Voice Tools

- Add grants, schema hashes, aliases, and snapshots.
- Send complete dynamic tool configurations to AssemblyAI.
- Handle tool-list changes and session teardown.

Acceptance: two agents can have different grants to one installation; name
collisions, schema changes, detaches, and stale calls cannot cross scope.

### Phase 6: Approvals and Mutating UI Tools

- Add visible approvals and risk-aware semantic wrappers.
- Add one click/type workflow with precondition and postcondition checks.
- Keep windows_batch disabled.

Acceptance: no consequential or data-loss action occurs without configured
approval, and denial/cancellation creates a clear audit event.

### Phase 7: Catalog Expansion and Remote MCP

- Promote one registry candidate at a time through reviewed connector adapters,
  pinned artifacts, discovery tests, and tool-policy mappings.
- Add reviewed connector import and updates.
- Design Streamable HTTP, OAuth, endpoint and redirect policy, DNS rebinding,
  audience, SSRF, tenancy, and revocation controls.

Acceptance: credentials never transit the model or another connector, and a
remote connector cannot reach an unapproved target.

### Phase 8: Native Platform Adapters

- Evaluate supported Windows ODR as an adapter.
- Add macOS only after Accessibility, signing, and packaging tests.

Acceptance: agents consume stable tool IDs while platform permission logic
remains isolated.

## Architecture Review Checklist

- Default provision does not mean auto-run or auto-grant.
- User uninstall is not undone on next login.
- App startup is independent of connector health.
- Public registry metadata is not executable trust.
- Stable connector, tool, agent, and skill IDs do not depend on display names.
- Install and update operations serialize across app and updater processes.
- Partial install or failed update cannot replace a working version.
- Updates do not occur during active sessions and can roll back.
- Duplicate names cannot collide; schema changes invalidate grants.
- Agents cannot reuse another agent's alias, grant, or element reference.
- A WebView cannot invent or substitute an agent or provider session.
- The agent cannot automate its own settings or approval surfaces.
- Lock, session switch, elevation, or unexpected focus cancels desktop action.
- Batch tools cannot bypass child-action approval.
- Disable or detach invalidates active snapshots.
- Crashes cannot loop forever or leave child processes.
- Sensitive content and credentials do not enter default logs.
- Bounds prevent one connector exhausting memory, output, queue, or time.
- Skills and MCP prompts cannot widen permissions.
- Skill packages contain no executable code and changed instructions require
  review.
- Database recovery never reconstructs grants or approvals.
- Tauri capabilities and Rust checks both enforce window/session authority.
- Remote MCP waits for its different threat model.
- FlaUI desktop access is disclosed, not described as sandboxed.

## References

- MCP architecture: https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
- MCP lifecycle: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- MCP transports: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP tools: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP SDK tiers: https://modelcontextprotocol.io/docs/2026-07-28/sdk
- Official Rust SDK: https://github.com/modelcontextprotocol/rust-sdk
- MCP registry: https://modelcontextprotocol.io/registry/about
- MCP security: https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices
- FlaUI-MCP: https://github.com/shanselman/FlaUI-MCP
- Windows MCP and ODR: https://learn.microsoft.com/windows/ai/mcp/
- AssemblyAI voice-agent tools: https://www.assemblyai.com/docs/universal-streaming/voice-agents/tools
- Tauri process model: https://v2.tauri.app/concept/process-model/
- Tauri capabilities: https://v2.tauri.app/security/capabilities/
- Tauri sidecars: https://v2.tauri.app/develop/sidecar/

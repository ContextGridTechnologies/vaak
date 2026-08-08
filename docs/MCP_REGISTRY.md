# Vaak MCP Registry

`apps/desktop/src-tauri/resources/mcp/registry.json` is the reviewed discovery
registry for MCP servers that Vaak may eventually support. It is deliberately
not a generic marketplace feed.

The registry keeps upstream metadata separate from Vaak admission policy:

- `status: available` means the current Vaak runtime can install the entry;
- `status: candidate` means it is a real open-source option worth reviewing,
  but no one-click installer is enabled yet;
- `status: deferred` means it needs a runtime capability that Vaak does not
  support in this release, such as Docker/OCI or remote HTTP transport;
- `distribution` records how the upstream project is published;
- `vaak.installStrategy`, `reviewStatus`, and `risk` record the local trust
  decision, not a claim made by the upstream project.

The registry is validated during Rust catalog reconciliation. The current
runtime intentionally exposes only the bundled, SHA-256-pinned FlaUI artifact
as installable. A package command in JSON is not permission to execute an
unpinned package: package-manager installation must be added through a reviewed
runtime adapter first.

## Recommended Windows shortlist

### 1. Windows MCP Server (`sbroenne/mcp-windows`)

This is the strongest alternative to FlaUI for semantic Windows automation. It
uses Windows UI Automation to find controls by name, includes snapshots,
tables, waits, app/window management, and explicit UI actions. Keep it as a
candidate until Vaak maps its batch, macro, clipboard, keyboard, mouse, and app
launch tools to the existing grant and protected-window policies.

### 2. Windows-MCP (`CursorTouch/Windows-MCP`)

This is the broadest computer-use option: UI interaction plus files,
processes, PowerShell, clipboard, and Registry tools. It is useful for a
power-user edition, but it is not a safer drop-in replacement for FlaUI. Its
authority is critical in Vaak terms, so the registry keeps it candidate-only
until the shell, filesystem, registry, process, telemetry, and destructive
actions are isolated behind explicit policies.

### 3. Playwright MCP (`microsoft/playwright-mcp`)

This is the best next connector outside native desktop UI. It provides
structured browser automation through Playwright accessibility snapshots and
works on Windows with a pinned npm package. It should be the first new
connector implemented after the registry because its scope is easier to make
explicit: allowed hosts/origins, workspace roots, browser profile, downloads,
and session lifetime.

## Other entries worth listing

- **Filesystem** — useful for approved project folders, but read/write/delete
  operations require user-selected roots and per-tool policy.
- **Git** — useful for repository status, diffs, logs, and eventually guarded
  mutations. Start read-only because the upstream reference server describes
  itself as early development.
- **Fetch** — useful for research and documentation, but needs URL allowlists
  and SSRF protection because the upstream implementation warns about local
  and internal IP access.
- **GitHub** — useful for repositories, issues, pull requests, and Actions, but
  defer it until Vaak has credential storage, OAuth callback handling, Docker or
  native-binary supervision, and repository/tool scopes.

The official MCP reference servers **Memory**, **Time**, and **Sequential
Thinking** are not first-wave connectors for Vaak: memory overlaps with local
skills/state, time is a small native utility, and sequential thinking is an
agent behavior rather than an external Windows capability.

## Admission checklist for a new `available` entry

1. Confirm repository ownership, license, release provenance, and maintenance.
2. Pin an exact version and a per-architecture artifact or package digest.
3. Keep the transport local stdio until remote transport security is implemented.
4. Run the server in a supervised runtime with bounded startup/call timeouts.
5. Enumerate tools and map each one to read, mutating, or destructive policy.
6. Deny protected Vaak windows, shell escape, arbitrary paths, and unbounded
   network access by default.
7. Store credentials in the OS credential store, never in registry JSON or tool
   arguments.
8. Add Rust lifecycle/policy tests, a real discovery test, and a frontend card
   test before changing `status` to `available`.

## Sources checked

The entries were checked against the upstream repositories and package docs on
2026-08-07:

- [FlaUI-MCP](https://github.com/shanselman/FlaUI-MCP)
- [Windows-MCP](https://github.com/CursorTouch/Windows-MCP)
- [Windows MCP Server](https://github.com/sbroenne/mcp-windows)
- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [MCP reference servers](https://github.com/modelcontextprotocol/servers)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [Official MCP Registry server.json format](https://modelcontextprotocol.io/registry/quickstart)

Upstream registry metadata is discovery input only. Vaak's local registry and
runtime policy remain authoritative for installation.

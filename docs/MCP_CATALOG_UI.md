# MCP Catalog UI

## Decision

The MCP screen is a catalog first and a connector editor second.

Call it **MCP catalog**, not marketplace, while Vaak only ships reviewed local
connectors. Marketplace implies arbitrary third-party discovery and installation,
which the current trust and provisioning model does not support.

The first catalog entry is **Windows Desktop (FlaUI)**. Adding more entries must
not make the catalog screen grow into one long permissions form.

Discovery metadata for future entries is maintained in
`apps/desktop/src-tauri/resources/mcp/registry.json`. Only entries marked
`available` by Vaak policy may appear as installable cards; candidates are not
rendered as install actions until their runtime adapter and tool policies are
implemented.

## User flow

```text
MCP catalog
  -> connector card
    -> connector details
      -> install or uninstall
      -> enable or disable
      -> attach or detach from Voice Agent
      -> test connection
      -> edit each tool grant
  -> Back to MCP catalog
```

The catalog is the default view. Connector controls are not rendered until the
user opens a card. This keeps discovery separate from configuration and leaves a
stable place for future connectors.

## Catalog card

Each card contains only information needed to compare and open a connector:

- connector icon and name;
- one-line purpose;
- Installed or Available status;
- transport label, currently Local;
- version and tool count;
- Manage for installed connectors or View for available connectors.

Cards use the existing shadcn `Card`, `Badge`, and `Button` components and form a
responsive one-column/two-column list. The action is a real button with a
connector-specific accessible name.

The catalog header is plain page content, not another card. This avoids a nested
card hierarchy: one returned connector produces exactly one visible card.

## Connector details

The details view retains the existing security boundaries:

- installation does not enable the connector;
- enabling does not attach it to an agent;
- attaching does not grant any tool;
- each tool remains Not granted, Always allow, Ask every time, or Deny;
- tools blocked by Vaak policy cannot be granted;
- Skills remain a separate section because instructions do not grant authority.

The Back to MCP catalog action clears transient connection health so status from
one connector cannot appear on another connector's details. Opening details moves
keyboard focus to its heading; returning moves focus back to the originating card.

The details view uses the same boundary-free `PageHeader` as the catalog. Its
configuration is split into three focused sections: Connection, Tool permissions,
and Skills. This keeps connector identity and lifecycle actions easy to find while
letting the permission list scan independently.

## Current implementation

The frontend entry point is
`apps/desktop/src/features/mcp/McpPanel.tsx`.

Reusable presentation components are intentionally small:

- `components/app/PageHeader.tsx` provides a boundary-free page title,
  description, and optional actions;
- `features/mcp/McpConnectorCard.tsx` owns connector summary metadata and the
  Manage/View action.

`McpPanel`:

1. loads the connector array and skills in parallel;
2. distinguishes initial loading from a successfully loaded empty catalog;
3. renders every returned connector as a card;
4. stores only the selected connector ID as local navigation state;
5. resolves the selected connector from the latest loaded array;
6. reloads catalog state after every mutation;
7. renders the existing lifecycle and tool controls for the selected connector.

The focused behavior checks live in
`apps/desktop/src/features/mcp/McpPanel.test.tsx`. They prove that controls are
hidden in the catalog, each card opens the matching detail view, Back restores the
catalog and keyboard focus, empty and failed loads remain distinct, and the covered
enable, attach, grant, and health commands retain their previous arguments.

No router or global store is needed for this first slice. The MCP screen already
owns the data, and catalog/detail navigation is temporary screen state.

## Adding the second connector

The catalog UI can already render multiple `McpConnector` values, but the Rust
backend still models FlaUI as the only connector. Before a second connector is
exposed, complete these backend changes:

1. Promote the candidate from the reviewed registry and replace
   `McpStateStore::list_connectors` construction of one hard-coded
   `DEFAULT_CONNECTOR_ID` result with catalog-backed iteration.
2. Route install, uninstall, runtime start/stop, tool discovery, and tool calls
   through the selected connector's runtime rather than the single FlaUI runtime.
3. Add `connectorId` to `test_mcp_connector`; the current command tests the
   global FlaUI runtime and cannot safely test a selected second connector.
4. Return display metadata from Rust instead of adding frontend ID checks:
   description, publisher, platform, transport, trust source, and compatibility.
5. Keep binding and grant records connector-scoped. Never infer grants from
   installation or copy grants between connectors.
6. Add one Rust catalog test and one frontend multi-connector interaction test
   for the new entry.

Do not add remote search, categories, ratings, or arbitrary URL installation
until Vaak has a reviewed-source policy, signature/digest verification, update
ownership, and a quarantine path. Those are marketplace features, not required
for the local catalog.

## Acceptance checks

- Opening MCPs initially shows cards, not the FlaUI permissions editor.
- The catalog page has no surrounding card or panel boundary.
- Connector details use a page-level heading followed by separate Connection,
  Tool permissions, and Skills sections.
- Windows Desktop shows Installed/Available, version, and tool count.
- Manage/View opens only that connector's details.
- Back returns to the catalog without changing connector state.
- Existing install, enable, attach, health, grant, and skill commands still work.
- A connector array with two entries renders two cards.
- An empty connector array renders a completed empty state, not an endless loader.
- A failed load reports its error without also claiming that the catalog is empty.
- The screen remains usable as one column on narrow windows and two columns at
  the existing `sm` breakpoint.

This document complements `MCP_PLATFORM_ARCHITECTURE.md`, which remains the
authority for runtime supervision, trust, storage, bindings, and tool snapshots.

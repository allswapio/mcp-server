# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-11-26

No change to the tools, the protocol handling or the runtime requirements.

### Changed

- `homepage` (npm) and `websiteUrl` (MCP Registry) point to the documentation page
  <https://allswap.io/docs/mcp>; the README links to it.
- README: the description of the `id` in `-32600` replies follows the code (the request's `id` is echoed when
  it is a string, a number or null).

### Added

- Repository files for directories and clients, not in the npm package: `glama.json`,
  `gemini-extension.json`.

## [1.0.1] - 2026-11-25

No change to the tools, the protocol handling or the runtime requirements.

### Added

- `mcpName` (`io.github.allswapio/mcp-server`) in `package.json`, the name used for the official MCP Registry.
- README: the MCP Registry name, and how to build and run a container image yourself from the repository.
- README: a contact for license inquiries.

### Changed

- `bin` in `package.json` is written the way npm normalises it (`bin/allswap-mcp.mjs`); the installed
  `allswap-mcp` command is the same.

## [1.0.0] - 2026-11-25

First public release.

### Added

- Read-only MCP server over stdio (line-delimited JSON-RPC 2.0), command `allswap-mcp`.
- Tools: `list_supported_assets`, `get_official_channels`, `get_tx_explorer_url`.
- `createMcpHandler` and `TOOLS` exports for use as a library, with TypeScript declarations.
- Protocol revisions `2025-11-25`, `2025-06-18`, `2025-03-26` and `2024-11-05` (`initialize`-based).
- Tool annotations: all tools `readOnlyHint: true`; `openWorldHint: true` only on `list_supported_assets`.
- The catalog request does not follow redirects and refuses response bodies over 5 MiB.
- `ALLSWAP_API_ORIGIN` / `apiOrigin` must be an `http:` or `https:` origin.
- Requires Node.js 22 or later.

[1.0.2]: https://github.com/allswapio/mcp-server/releases/tag/v1.0.2
[1.0.1]: https://github.com/allswapio/mcp-server/releases/tag/v1.0.1
[1.0.0]: https://github.com/allswapio/mcp-server/releases/tag/v1.0.0

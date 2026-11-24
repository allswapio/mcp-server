# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/allswapio/mcp-server/releases/tag/v1.0.0

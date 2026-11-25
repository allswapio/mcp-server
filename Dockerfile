# Container image for the stdio MCP server. It has no runtime dependencies, so
# nothing is installed: only package.json, bin/, src/ and LICENSE are copied.
# Build it yourself from this repository:
#
#     docker build -t allswap-mcp .
#     docker run --rm -i allswap-mcp
#
# The server reads JSON-RPC messages on stdin and writes replies on stdout, so
# run it with -i (and without -t). It needs outbound HTTPS to allswap.io only
# for the list_supported_assets tool.
FROM node:22-alpine

LABEL org.opencontainers.image.title="@allswapio/mcp-server" \
      org.opencontainers.image.description="Read-only MCP server (stdio) for AllSwap's public asset catalog, official channels and block-explorer links" \
      org.opencontainers.image.source="https://github.com/allswapio/mcp-server" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY package.json LICENSE ./
COPY bin/ ./bin/
COPY src/ ./src/

# The official Node.js images ship an unprivileged "node" user.
USER node

ENTRYPOINT ["node", "/app/bin/allswap-mcp.mjs"]

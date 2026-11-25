// Zero-dependency, read-only MCP server (JSON-RPC 2.0) with three tools:
// list_supported_assets, get_official_channels, get_tx_explorer_url.

// The npm package name and version. These are the only copies in the source;
// tests compare them with package.json and server.json through the initialize
// response, so a release that bumps one without the others fails the tests.
const PACKAGE_NAME = "@allswapio/mcp-server";
const PACKAGE_VERSION = "1.0.1";

const SERVER_INFO = Object.freeze({
  name: PACKAGE_NAME,
  version: PACKAGE_VERSION,
});

// Protocol revisions this server answers with. A client that asks for one of
// these gets it back; a client that asks for anything else gets the newest one
// listed here and decides whether to continue (MCP lifecycle, version negotiation).
// Only the initialize-based revisions are implemented (not 2026-07-28 and later).
const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]);
const FALLBACK_PROTOCOL_VERSION = "2024-11-05"; // used when the client sends none

const DEFAULT_API_ORIGIN = "https://allswap.io";
const FETCH_TIMEOUT_MS = 8000;
const MAX_CATALOG_BYTES = 5 * 1024 * 1024; // larger catalog responses are refused

const OFFICIAL_CHANNELS = Object.freeze({
  website: "https://allswap.io",
  docs: "https://allswap.io/docs",
  openApiSpec: "https://allswap.io/docs/openapi.json",
  verifyPage: "https://allswap.io/verify",
  supportEmail: "service@allswap.io",
  securityEmail: "service@allswap.io",
  telegram: "https://t.me/allswapservice",
  x: "https://x.com/allswapio",
  chromeExtensionId: "dnhjpbfcknjplcaeichdjakeenahlhbo",
  chromeExtensionUrl:
    "https://chromewebstore.google.com/detail/allswap-rate-network-expl/dnhjpbfcknjplcaeichdjakeenahlhbo",
  operatingEntity: "Haohang Network Technology Co., Limited",
  hkBrn: "76806355",
  duns: "989291645",
  registeredAddress: "Rm D07 8/F KAI TAK FTY BLDG 99 KING FUK ST Kowloon City Hong Kong",
  compliancePage: "https://allswap.io/compliance",
  nativeTokenPolicy: "None — AllSwap does not issue any native platform token, presale, or airdrop.",
});

const TX_EXPLORERS = Object.freeze({
  eth: { baseUrl: "https://etherscan.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  "eip155:1": { baseUrl: "https://etherscan.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  arb: { baseUrl: "https://arbiscan.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  "eip155:42161": { baseUrl: "https://arbiscan.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  base: { baseUrl: "https://basescan.org/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  "eip155:8453": { baseUrl: "https://basescan.org/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  bsc: { baseUrl: "https://bscscan.com/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  "eip155:56": { baseUrl: "https://bscscan.com/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  op: { baseUrl: "https://optimistic.etherscan.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  "eip155:10": { baseUrl: "https://optimistic.etherscan.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  pol: { baseUrl: "https://polygonscan.com/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  "eip155:137": { baseUrl: "https://polygonscan.com/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  avax: { baseUrl: "https://snowtrace.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  "eip155:43114": { baseUrl: "https://snowtrace.io/tx/", pattern: /^0x[0-9a-fA-F]{64}$/ },
  btc: { baseUrl: "https://mempool.space/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  "bip122:000000000019d6689c085ae165831e93": { baseUrl: "https://mempool.space/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  ltc: { baseUrl: "https://litecoinspace.org/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  "bip122:12a765e31ffd4059bada1e25190f6e98": { baseUrl: "https://litecoinspace.org/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  doge: { baseUrl: "https://blockchair.com/dogecoin/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  "bip122:1a91e3dace36e2be3bf030a65679fe82": { baseUrl: "https://blockchair.com/dogecoin/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  bch: { baseUrl: "https://blockchair.com/bitcoin-cash/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  "bip122:000000000000000000651ef99cb9fcbe": { baseUrl: "https://blockchair.com/bitcoin-cash/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  zec: { baseUrl: "https://blockchair.com/zcash/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  // The chain id that AllSwap's public asset API (GET /api/v2/assets) returns for Zcash.
  "bip122:0007104ccda289427919efc39dc9e4d4": { baseUrl: "https://blockchair.com/zcash/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  // The genesis-hash CAIP-2 id for Zcash.
  "bip122:00040fe8ec8471911baa1db1266ea15d": { baseUrl: "https://blockchair.com/zcash/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  tron: { baseUrl: "https://tronscan.org/#/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  "tron:mainnet": { baseUrl: "https://tronscan.org/#/transaction/", pattern: /^[0-9a-fA-F]{64}$/ },
  sol: { baseUrl: "https://solscan.io/tx/", pattern: /^[1-9A-HJ-NP-Za-km-z]{32,96}$/ },
  "solana:5eykt4usfv8p8njdtrepy1vzqkqzkvdp": { baseUrl: "https://solscan.io/tx/", pattern: /^[1-9A-HJ-NP-Za-km-z]{32,96}$/ },
  // TON: hex hashes only (a Base64 hash may contain "/" or "+", whose encoded form tonscan is not known to accept)
  ton: { baseUrl: "https://tonscan.org/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  "ton:mainnet": { baseUrl: "https://tonscan.org/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  xrp: { baseUrl: "https://xrpscan.com/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  "ripple:0": { baseUrl: "https://xrpscan.com/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  stellar: { baseUrl: "https://stellar.expert/explorer/public/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  "stellar:public": { baseUrl: "https://stellar.expert/explorer/public/tx/", pattern: /^[0-9a-fA-F]{64}$/ },
  near: { baseUrl: "https://nearblocks.io/txns/", pattern: /^[1-9A-HJ-NP-Za-km-z]{32,96}$/ },
  "near:mainnet": { baseUrl: "https://nearblocks.io/txns/", pattern: /^[1-9A-HJ-NP-Za-km-z]{32,96}$/ },
  sui: { baseUrl: "https://suiscan.xyz/mainnet/tx/", pattern: /^[1-9A-HJ-NP-Za-km-z]{32,96}$/ },
  "sui:mainnet": { baseUrl: "https://suiscan.xyz/mainnet/tx/", pattern: /^[1-9A-HJ-NP-Za-km-z]{32,96}$/ },
  aptos: { baseUrl: "https://explorer.aptoslabs.com/txn/", pattern: /^0x[0-9a-fA-F]{1,64}$/ },
  "aptos:mainnet": { baseUrl: "https://explorer.aptoslabs.com/txn/", pattern: /^0x[0-9a-fA-F]{1,64}$/ },
});

export const TOOLS = Object.freeze([
  {
    name: "list_supported_assets",
    description:
      "Fetch AllSwap's public asset catalog (GET /api/v2/assets, no authentication) and filter it by exact symbol, chain id substring or quotable flag. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        symbol: { type: "string", description: "Optional case-insensitive symbol filter (e.g. USDT, BTC)." },
        chainId: { type: "string", description: "Optional substring match on CAIP-2 chainId (e.g. eip155:1, tron)." },
        quotableOnly: { type: "boolean", description: "If true, include only currently quotable assets." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Max assets to return (default 25)." },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_official_channels",
    description:
      "Return AllSwap's official website and documentation links, contact email, social accounts, Chrome extension ID, company registration details and its statement that it issues no token. Offline.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_tx_explorer_url",
    description:
      "Return an HTTPS block explorer URL for a transaction hash on a supported mainnet network. Offline: only the hash format is checked, not whether the transaction exists.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["network", "txHash"],
      properties: {
        network: { type: "string", description: "Network key or CAIP-2 ID (e.g. eth, eip155:8453, tron, btc, sol, ton)." },
        txHash: { type: "string", description: "On-chain transaction hash." },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]);

function negotiateProtocolVersion(requested) {
  if (typeof requested !== "string") return FALLBACK_PROTOCOL_VERSION;
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
}

function resolveTxExplorer(network, txHash) {
  if (typeof network !== "string" || typeof txHash !== "string") return null;
  const rawNet = network.trim().toLowerCase();
  if (!rawNet) return null;
  const spec = Object.prototype.hasOwnProperty.call(TX_EXPLORERS, rawNet) ? TX_EXPLORERS[rawNet] : null;
  if (!spec) return null;
  const hash = txHash.trim();
  if (!spec.pattern.test(hash)) return null;
  return `${spec.baseUrl}${encodeURIComponent(hash)}`;
}

/** Returns the origin without a trailing slash, or throws a TypeError. */
function parseApiOrigin(value) {
  const trimmed = typeof value === "string" ? value.replace(/\/$/, "") : "";
  let url = null;
  try {
    url = new URL(trimmed);
  } catch {
    // reported below
  }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== trimmed) {
    throw new TypeError(
      `apiOrigin must be an http(s) origin with no path, such as "https://allswap.io"; got ${JSON.stringify(String(value))}`,
    );
  }
  return trimmed;
}

/** A JSON-RPC id this server echoes: a string, a number or null. */
function isValidId(id) {
  return id === null || typeof id === "string" || (typeof id === "number" && Number.isFinite(id));
}

/** Reads the body as text, refusing more than maxBytes (Content-Length first, then while streaming). */
async function readBodyCapped(res, maxBytes) {
  const declared = Number(res.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel?.().catch(() => {});
    throw new Error(`Catalog response exceeds ${maxBytes} bytes`);
  }
  if (!res.body?.getReader) {
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`Catalog response exceeds ${maxBytes} bytes`);
    return text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`Catalog response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function textResult(data, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function createMcpHandler(options = {}) {
  const apiOrigin = parseApiOrigin(options.apiOrigin ?? DEFAULT_API_ORIGIN);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_CATALOG_BYTES;

  async function callTool(name, args = {}) {
    if (name === "get_official_channels") {
      return textResult(OFFICIAL_CHANNELS);
    }

    if (name === "get_tx_explorer_url") {
      const url = resolveTxExplorer(args?.network, args?.txHash);
      return textResult({
        network: typeof args?.network === "string" ? args.network : null,
        txHash: typeof args?.txHash === "string" ? args.txHash : null,
        explorerUrl: url,
        valid: url !== null,
      });
    }

    if (name === "list_supported_assets") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${apiOrigin}/api/v2/assets`, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "error",
          signal: controller.signal,
        });
        if (!res.ok) {
          return textResult({ error: `Catalog endpoint returned HTTP ${res.status}` }, true);
        }
        const payload = JSON.parse(await readBodyCapped(res, maxBytes));
        const allAssets = Array.isArray(payload?.assets) ? payload.assets : [];
        const symFilter = typeof args?.symbol === "string" ? args.symbol.trim().toLowerCase() : "";
        const chainFilter = typeof args?.chainId === "string" ? args.chainId.trim().toLowerCase() : "";
        const quotableOnly = args?.quotableOnly === true;
        const limit =
          typeof args?.limit === "number" && Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 200
            ? args.limit
            : 25;

        const filtered = allAssets.filter((item) => {
          if (quotableOnly && item?.quotable === false) return false;
          if (symFilter && String(item?.symbol ?? "").toLowerCase() !== symFilter) return false;
          if (chainFilter && !String(item?.chainId ?? "").toLowerCase().includes(chainFilter)) return false;
          return true;
        });

        return textResult({
          observedAt: payload?.observedAt ?? null,
          stale: Boolean(payload?.stale),
          totalAssets: allAssets.length,
          matchedAssets: filtered.length,
          returnedAssets: filtered.slice(0, limit),
        });
      } catch (error) {
        return textResult(
          { error: error instanceof Error ? error.message : "Failed to fetch public asset catalog" },
          true,
        );
      } finally {
        clearTimeout(timer);
      }
    }

    return null;
  }

  return async function handleMessage(msg) {
    if (
      !msg ||
      typeof msg !== "object" ||
      Array.isArray(msg) ||
      msg.jsonrpc !== "2.0" ||
      typeof msg.method !== "string" ||
      (msg.id !== undefined && !isValidId(msg.id))
    ) {
      return {
        jsonrpc: "2.0",
        id: msg && typeof msg === "object" && isValidId(msg.id) ? msg.id : null,
        error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" },
      };
    }

    const { id, method, params } = msg;
    const isNotification = id === undefined;

    if (method === "notifications/initialized") {
      return null;
    }

    if (method === "initialize") {
      if (isNotification) return null;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }

    if (method === "ping") {
      if (isNotification) return null;
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      if (isNotification) return null;
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    }

    if (method === "tools/call") {
      if (isNotification) return null;
      const toolName = params?.name;
      const result = await callTool(toolName, params?.arguments);
      if (result === null) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: typeof toolName === "string" ? `Unknown tool: ${toolName}` : "Unknown tool: name must be a string",
          },
        };
      }
      return { jsonrpc: "2.0", id, result };
    }

    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  };
}

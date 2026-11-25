import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMcpHandler, TOOLS } from "../src/server.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const CATALOG = {
  version: "catalog-test",
  observedAt: "2026-11-20T00:00:00Z",
  stale: false,
  nextCursor: null,
  assets: [
    { assetId: "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7", chainId: "eip155:1", symbol: "USDT", decimals: 6, quotable: true },
    { assetId: "tron:mainnet/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", chainId: "tron:mainnet", symbol: "USDT", decimals: 6, quotable: true },
    { assetId: "bip122:000000000019d6689c085ae165831e93/slip44:0", chainId: "bip122:000000000019d6689c085ae165831e93", symbol: "BTC", decimals: 8, quotable: false },
    { assetId: "eip155:8453/slip44:60", chainId: "eip155:8453", symbol: "ETH", decimals: 18, quotable: true },
  ],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function catalogHandler(body = CATALOG, calls = []) {
  return createMcpHandler({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(body);
    },
  });
}

let nextId = 1;
async function callTool(handle, name, args) {
  const reply = await handle({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } });
  assert.equal(reply.jsonrpc, "2.0");
  assert.equal(reply.error, undefined, JSON.stringify(reply.error));
  assert.equal(reply.result.content.length, 1);
  assert.equal(reply.result.content[0].type, "text");
  return { data: JSON.parse(reply.result.content[0].text), isError: reply.result.isError === true };
}

test("initialize reports the package name and version from package.json", async () => {
  const handle = catalogHandler();
  const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.deepEqual(init, {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: pkg.name, version: pkg.version },
    },
  });
  const noVersion = await handle({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} });
  assert.equal(noVersion.result.protocolVersion, "2024-11-05");
  for (const version of ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]) {
    const same = await handle({ jsonrpc: "2.0", id: 3, method: "initialize", params: { protocolVersion: version } });
    assert.equal(same.result.protocolVersion, version);
  }
  // an unknown or newer revision gets the newest revision this server supports
  for (const version of ["2099-01-01", "2026-07-28", "1.0", ""]) {
    const other = await handle({ jsonrpc: "2.0", id: 4, method: "initialize", params: { protocolVersion: version } });
    assert.equal(other.result.protocolVersion, "2025-11-25");
  }
});

test("server.json (MCP Registry metadata) matches package.json and the initialize response", async () => {
  const serverJson = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
  for (const key of ["$schema", "name", "description", "version", "packages"]) {
    assert.ok(Object.hasOwn(serverJson, key), `server.json has ${key}`);
  }
  assert.match(serverJson.$schema, /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/\d{4}-\d{2}-\d{2}\/server\.schema\.json$/);
  assert.equal(pkg.mcpName, serverJson.name, "package.json mcpName equals server.json name");
  assert.match(serverJson.name, /^io\.github\.allswapio\/[a-zA-Z0-9._-]+$/);
  assert.equal(typeof serverJson.description, "string");
  assert.ok(serverJson.description.length >= 1 && serverJson.description.length <= 100, `description is ${serverJson.description.length} characters`);

  assert.equal(serverJson.packages.length, 1);
  const [npmPackage] = serverJson.packages;
  assert.equal(npmPackage.registryType, "npm");
  assert.equal(npmPackage.identifier, pkg.name);
  assert.equal(npmPackage.runtimeHint, "npx");
  assert.deepEqual(npmPackage.transport, { type: "stdio" });

  const init = await catalogHandler()({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const versions = {
    "package.json": pkg.version,
    "server.json version": serverJson.version,
    "gemini-extension.json version": JSON.parse(readFileSync(new URL("../gemini-extension.json", import.meta.url), "utf8")).version,
    "server.json packages[0].version": npmPackage.version,
    "initialize serverInfo.version": init.result.serverInfo.version,
  };
  assert.equal(new Set(Object.values(versions)).size, 1, JSON.stringify(versions));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);

  // server.json is registry metadata only; it is not shipped in the npm package.
  assert.ok(!pkg.files.includes("server.json"));
});

test("ping and tools/list", async () => {
  const handle = catalogHandler();
  assert.deepEqual(await handle({ jsonrpc: "2.0", id: "p", method: "ping" }), { jsonrpc: "2.0", id: "p", result: {} });
  const list = await handle({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.deepEqual(list.result.tools.map((t) => t.name), ["list_supported_assets", "get_official_channels", "get_tx_explorer_url"]);
  assert.equal(list.result.tools, TOOLS);
  for (const tool of TOOLS) {
    assert.equal(typeof tool.description, "string");
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test("tool annotations: all read-only; only the catalog tool reaches the network", () => {
  assert.deepEqual(
    Object.fromEntries(TOOLS.map((tool) => [tool.name, tool.annotations])),
    {
      list_supported_assets: { readOnlyHint: true, openWorldHint: true },
      get_official_channels: { readOnlyHint: true, openWorldHint: false },
      get_tx_explorer_url: { readOnlyHint: true, openWorldHint: false },
    },
  );
});

test("server/discover (a 2026-07-28 probe) is answered as an unknown method", async () => {
  const reply = await catalogHandler()({ jsonrpc: "2.0", id: 1, method: "server/discover", params: {} });
  assert.equal(reply.error.code, -32601);
});

test("notifications get no reply", async () => {
  const handle = catalogHandler();
  for (const method of ["notifications/initialized", "notifications/cancelled", "initialize", "ping", "tools/list", "tools/call", "no/such/method"]) {
    assert.equal(await handle({ jsonrpc: "2.0", method, params: {} }), null, method);
  }
});

test("unknown method and invalid envelopes", async () => {
  const handle = catalogHandler();
  assert.deepEqual(await handle({ jsonrpc: "2.0", id: 9, method: "resources/list" }), {
    jsonrpc: "2.0", id: 9, error: { code: -32601, message: "Method not found: resources/list" },
  });
  for (const msg of [null, "text", 42, [], [{ jsonrpc: "2.0", id: 1, method: "ping" }], {}, { id: 4, method: "ping" },
    { jsonrpc: "1.0", id: 5, method: "ping" }, { jsonrpc: "2.0", id: 6 }, { jsonrpc: "2.0", id: 7, method: 7 }]) {
    const reply = await handle(msg);
    assert.equal(reply.jsonrpc, "2.0");
    assert.equal(reply.error.code, -32600, JSON.stringify(msg));
    assert.equal(reply.id, msg && typeof msg === "object" && !Array.isArray(msg) && msg.id !== undefined ? msg.id : null);
  }
});

test("an id that is not a string, number or null is an invalid request answered with id null", async () => {
  const handle = catalogHandler();
  const deep = JSON.parse("[".repeat(20000) + "]".repeat(20000));
  for (const id of [deep, [1], { a: 1 }, true, false]) {
    for (const method of ["ping", "tools/call", "no/such/method"]) {
      const reply = await handle({ jsonrpc: "2.0", id, method, params: { name: "get_official_channels" } });
      assert.deepEqual(reply, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } });
      assert.doesNotThrow(() => JSON.stringify(reply));
    }
  }
  // Without a method, a bad id is not echoed either.
  assert.equal((await handle({ jsonrpc: "2.0", id: deep })).id, null);
  // Valid ids are echoed.
  for (const id of ["a", 0, -1.5, null]) {
    assert.equal((await handle({ jsonrpc: "2.0", id, method: "ping" })).id, id);
  }
});

test("unknown tool is a -32602 error", async () => {
  const handle = catalogHandler();
  for (const name of ["nonexistent", "check_memo_policy"]) {
    const reply = await handle({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name, arguments: {} } });
    assert.deepEqual(reply.error, { code: -32602, message: `Unknown tool: ${name}` });
  }
  // A tool name that is not a string is never echoed.
  const deep = JSON.parse("[".repeat(20000) + "]".repeat(20000));
  for (const name of [undefined, null, 7, deep, { toString: 1 }]) {
    const reply = await handle({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name, arguments: {} } });
    assert.deepEqual(reply.error, { code: -32602, message: "Unknown tool: name must be a string" });
    assert.doesNotThrow(() => JSON.stringify(reply));
  }
  const noParams = await handle({ jsonrpc: "2.0", id: 11, method: "tools/call" });
  assert.equal(noParams.error.code, -32602);
});

test("get_official_channels", async () => {
  const handle = catalogHandler();
  const { data, isError } = await callTool(handle, "get_official_channels", {});
  assert.equal(isError, false);
  assert.equal(data.website, "https://allswap.io");
  assert.equal(data.operatingEntity, "Haohang Network Technology Co., Limited");
  assert.equal(data.registeredAddress, "Rm D07 8/F KAI TAK FTY BLDG 99 KING FUK ST Kowloon City Hong Kong");
  assert.equal(data.hkBrn, "76806355");
  assert.equal(data.duns, "989291645");
  assert.equal(data.supportEmail, "service@allswap.io");
  assert.equal(data.securityEmail, "service@allswap.io");
  assert.equal(data.chromeExtensionId, "dnhjpbfcknjplcaeichdjakeenahlhbo");
  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.startsWith("http")) assert.match(value, /^https:\/\//);
  }
  // Works without arguments as well.
  assert.deepEqual((await callTool(handle, "get_official_channels")).data, data);
});

test("list_supported_assets: happy path and request shape", async () => {
  const calls = [];
  const handle = catalogHandler(CATALOG, calls);
  const { data, isError } = await callTool(handle, "list_supported_assets", {});
  assert.equal(isError, false);
  assert.deepEqual(data, {
    observedAt: "2026-11-20T00:00:00Z",
    stale: false,
    totalAssets: 4,
    matchedAssets: 4,
    returnedAssets: CATALOG.assets,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://allswap.io/api/v2/assets");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.equal(calls[0].init.redirect, "error");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("list_supported_assets: apiOrigin option, trailing slash removed", async () => {
  const urls = [];
  const handle = createMcpHandler({
    apiOrigin: "https://catalog.example/",
    fetchImpl: async (url) => {
      urls.push(url);
      return jsonResponse(CATALOG);
    },
  });
  await callTool(handle, "list_supported_assets", {});
  assert.deepEqual(urls, ["https://catalog.example/api/v2/assets"]);
});

test("apiOrigin must be an http(s) origin; anything else throws a TypeError", () => {
  for (const origin of ["https://allswap.io", "https://allswap.io/", "http://localhost", "https://catalog.example"]) {
    assert.doesNotThrow(() => createMcpHandler({ apiOrigin: origin }), origin);
  }
  for (const origin of [
    "", "allswap.io", "ftp://allswap.io", "file:///etc", "javascript:alert(1)", "https://allswap.io/api",
    "https://allswap.io/?x=1", "https://allswap.io#x", "https://user:pw@allswap.io", "https://AllSwap.io",
    "https://allswap.io:443", "https://allswap.io//", " https://allswap.io", 42,
  ]) {
    assert.throws(() => createMcpHandler({ apiOrigin: origin }), TypeError, String(origin));
  }
  // undefined or null selects the default origin
  assert.doesNotThrow(() => createMcpHandler({ apiOrigin: null }));
  assert.doesNotThrow(() => createMcpHandler());
});

test("list_supported_assets: response body larger than the cap is refused", async () => {
  const big = JSON.stringify({ ...CATALOG, padding: "x".repeat(2000) });
  // Declared too large by Content-Length: refused before reading.
  const declared = createMcpHandler({
    maxBytes: 1000,
    fetchImpl: async () =>
      new Response(new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Length": String(6 * 1024 * 1024) },
      }),
  });
  const r1 = await callTool(declared, "list_supported_assets", {});
  assert.equal(r1.isError, true);
  assert.deepEqual(r1.data, { error: "Catalog response exceeds 1000 bytes" });

  // No Content-Length: reading stops once the cap is passed.
  let chunksSent = 0;
  let cancelled = false;
  const streamed = createMcpHandler({
    maxBytes: 1000,
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          pull(c) { chunksSent++; c.enqueue(new Uint8Array(400)); },
          cancel() { cancelled = true; },
        }),
        { status: 200 },
      ),
  });
  const r2 = await callTool(streamed, "list_supported_assets", {});
  assert.deepEqual(r2, { data: { error: "Catalog response exceeds 1000 bytes" }, isError: true });
  assert.equal(cancelled, true);
  assert.ok(chunksSent <= 4, `read ${chunksSent} chunks`);

  // The default cap is 5 MB: a body just under it is accepted, one just over it is refused.
  const base = JSON.stringify({ ...CATALOG, padding: "" }).length;
  const under = JSON.stringify({ ...CATALOG, padding: "x".repeat(5 * 1024 * 1024 - base) });
  const over = JSON.stringify({ ...CATALOG, padding: "x".repeat(5 * 1024 * 1024 - base + 1) });
  assert.equal(Buffer.byteLength(under), 5 * 1024 * 1024);
  const ok = await callTool(createMcpHandler({ fetchImpl: async () => new Response(under) }), "list_supported_assets", {});
  assert.equal(ok.isError, false);
  const tooBig = await callTool(createMcpHandler({ fetchImpl: async () => new Response(over) }), "list_supported_assets", {});
  assert.deepEqual(tooBig.data, { error: `Catalog response exceeds ${5 * 1024 * 1024} bytes` });
});

test("list_supported_assets: filters", async () => {
  const handle = catalogHandler();
  const pick = async (args) => (await callTool(handle, "list_supported_assets", args)).data;

  let data = await pick({ symbol: "usdt" });
  assert.equal(data.matchedAssets, 2);
  data = await pick({ symbol: " USDT ", chainId: "TRON" });
  assert.deepEqual(data.returnedAssets.map((a) => a.chainId), ["tron:mainnet"]);
  data = await pick({ symbol: "US" }); // exact symbol match, not a substring
  assert.equal(data.matchedAssets, 0);
  data = await pick({ chainId: "eip155" }); // substring match on chainId
  assert.deepEqual(data.returnedAssets.map((a) => a.chainId), ["eip155:1", "eip155:8453"]);
  data = await pick({ quotableOnly: true });
  assert.deepEqual(data.returnedAssets.map((a) => a.symbol), ["USDT", "USDT", "ETH"]);
  data = await pick({ quotableOnly: "true" }); // only boolean true filters
  assert.equal(data.matchedAssets, 4);
  data = await pick({ symbol: "BTC", quotableOnly: true });
  assert.equal(data.matchedAssets, 0);
  assert.equal(data.totalAssets, 4);
});

test("list_supported_assets: limit bounds", async () => {
  const assets = Array.from({ length: 250 }, (_, i) => ({ chainId: "eip155:1", symbol: `T${i}`, quotable: true }));
  const handle = catalogHandler({ ...CATALOG, assets });
  const count = async (args) => {
    const { data } = await callTool(handle, "list_supported_assets", args);
    assert.equal(data.matchedAssets, 250);
    return data.returnedAssets.length;
  };
  assert.equal(await count({}), 25, "default");
  assert.equal(await count({ limit: 1 }), 1);
  assert.equal(await count({ limit: 200 }), 200);
  // Out-of-range or non-integer values fall back to the default of 25.
  for (const limit of [0, -1, 201, 1.5, "10", null]) {
    assert.equal(await count({ limit }), 25, String(limit));
  }
});

test("list_supported_assets: unexpected payloads", async () => {
  const empty = await callTool(catalogHandler({ observedAt: null }), "list_supported_assets", {});
  assert.deepEqual(empty.data, { observedAt: null, stale: false, totalAssets: 0, matchedAssets: 0, returnedAssets: [] });
  const notJson = createMcpHandler({ fetchImpl: async () => new Response("<html>", { status: 200 }) });
  const bad = await callTool(notJson, "list_supported_assets", {});
  assert.equal(bad.isError, true);
  assert.equal(typeof bad.data.error, "string");
});

test("list_supported_assets: non-200 response is a tool error", async () => {
  for (const status of [404, 429, 500, 503]) {
    const handle = createMcpHandler({ fetchImpl: async () => jsonResponse({ error: { code: "X" } }, status) });
    const { data, isError } = await callTool(handle, "list_supported_assets", {});
    assert.equal(isError, true);
    assert.deepEqual(data, { error: `Catalog endpoint returned HTTP ${status}` });
  }
});

test("list_supported_assets: thrown fetch error is a tool error", async () => {
  const handle = createMcpHandler({
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });
  const { data, isError } = await callTool(handle, "list_supported_assets", {});
  assert.equal(isError, true);
  assert.deepEqual(data, { error: "fetch failed" });

  const nonError = createMcpHandler({
    fetchImpl: async () => {
      throw "boom"; // eslint-disable-line no-throw-literal
    },
  });
  assert.deepEqual((await callTool(nonError, "list_supported_assets", {})).data, { error: "Failed to fetch public asset catalog" });
});

test("list_supported_assets: timeout aborts the request", async () => {
  let aborted = false;
  const handle = createMcpHandler({
    timeoutMs: 20,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          aborted = true;
          reject(init.signal.reason ?? new Error("aborted"));
        });
      }),
  });
  const started = Date.now();
  const { data, isError } = await callTool(handle, "list_supported_assets", {});
  assert.equal(aborted, true);
  assert.equal(isError, true);
  assert.equal(typeof data.error, "string");
  assert.ok(Date.now() - started < 2000);
});

const HEX64 = "ab".repeat(32);
const BASE58_SIG = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp123456789ABCDEFGHJKLMNPQ";

test("get_tx_explorer_url: every explorer family", async () => {
  const handle = catalogHandler();
  const cases = [
    ["eth", `0x${HEX64}`, "https://etherscan.io/tx/"],
    ["eip155:1", `0x${HEX64}`, "https://etherscan.io/tx/"],
    ["arb", `0x${HEX64}`, "https://arbiscan.io/tx/"],
    ["eip155:42161", `0x${HEX64}`, "https://arbiscan.io/tx/"],
    ["base", `0x${HEX64}`, "https://basescan.org/tx/"],
    ["eip155:8453", `0x${HEX64}`, "https://basescan.org/tx/"],
    ["bsc", `0x${HEX64}`, "https://bscscan.com/tx/"],
    ["eip155:56", `0x${HEX64}`, "https://bscscan.com/tx/"],
    ["op", `0x${HEX64}`, "https://optimistic.etherscan.io/tx/"],
    ["eip155:10", `0x${HEX64}`, "https://optimistic.etherscan.io/tx/"],
    ["pol", `0x${HEX64}`, "https://polygonscan.com/tx/"],
    ["eip155:137", `0x${HEX64}`, "https://polygonscan.com/tx/"],
    ["avax", `0x${HEX64}`, "https://snowtrace.io/tx/"],
    ["eip155:43114", `0x${HEX64}`, "https://snowtrace.io/tx/"],
    ["btc", HEX64, "https://mempool.space/tx/"],
    ["bip122:000000000019d6689c085ae165831e93", HEX64, "https://mempool.space/tx/"],
    ["ltc", HEX64, "https://litecoinspace.org/tx/"],
    ["bip122:12a765e31ffd4059bada1e25190f6e98", HEX64, "https://litecoinspace.org/tx/"],
    ["doge", HEX64, "https://blockchair.com/dogecoin/transaction/"],
    ["bip122:1a91e3dace36e2be3bf030a65679fe82", HEX64, "https://blockchair.com/dogecoin/transaction/"],
    ["bch", HEX64, "https://blockchair.com/bitcoin-cash/transaction/"],
    ["bip122:000000000000000000651ef99cb9fcbe", HEX64, "https://blockchair.com/bitcoin-cash/transaction/"],
    ["zec", HEX64, "https://blockchair.com/zcash/transaction/"],
    ["bip122:0007104ccda289427919efc39dc9e4d4", HEX64, "https://blockchair.com/zcash/transaction/"],
    ["bip122:00040fe8ec8471911baa1db1266ea15d", HEX64, "https://blockchair.com/zcash/transaction/"],
    ["tron", HEX64, "https://tronscan.org/#/transaction/"],
    ["tron:mainnet", HEX64, "https://tronscan.org/#/transaction/"],
    ["sol", BASE58_SIG, "https://solscan.io/tx/"],
    ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", BASE58_SIG, "https://solscan.io/tx/"],
    ["ton", HEX64, "https://tonscan.org/tx/"],
    ["ton:mainnet", HEX64, "https://tonscan.org/tx/"],
    ["xrp", HEX64.toUpperCase(), "https://xrpscan.com/tx/"],
    ["ripple:0", HEX64, "https://xrpscan.com/tx/"],
    ["stellar", HEX64, "https://stellar.expert/explorer/public/tx/"],
    ["stellar:public", HEX64, "https://stellar.expert/explorer/public/tx/"],
    ["near", BASE58_SIG, "https://nearblocks.io/txns/"],
    ["near:mainnet", BASE58_SIG, "https://nearblocks.io/txns/"],
    ["sui", BASE58_SIG, "https://suiscan.xyz/mainnet/tx/"],
    ["sui:mainnet", BASE58_SIG, "https://suiscan.xyz/mainnet/tx/"],
    ["aptos", "0x1a2b", "https://explorer.aptoslabs.com/txn/"],
    ["aptos:mainnet", `0x${HEX64}`, "https://explorer.aptoslabs.com/txn/"],
  ];
  for (const [network, txHash, base] of cases) {
    const { data, isError } = await callTool(handle, "get_tx_explorer_url", { network, txHash });
    assert.equal(isError, false);
    assert.deepEqual(data, { network, txHash, explorerUrl: `${base}${txHash}`, valid: true }, network);
  }
  // Network keys are case-insensitive and both values are trimmed.
  const trimmed = await callTool(handle, "get_tx_explorer_url", { network: " ETH ", txHash: ` 0x${HEX64} ` });
  assert.equal(trimmed.data.explorerUrl, `https://etherscan.io/tx/0x${HEX64}`);
});

test("get_tx_explorer_url: rejections return valid:false and no URL", async () => {
  const handle = catalogHandler();
  const rejected = [
    { network: "eth", txHash: HEX64 }, // missing 0x
    { network: "eth", txHash: `0x${HEX64.slice(2)}` }, // 31 bytes
    { network: "eth", txHash: `0x${HEX64}00` },
    { network: "eth", txHash: `0x${"zz".repeat(32)}` },
    { network: "btc", txHash: `0x${HEX64}` },
    { network: "sol", txHash: "0OIl".repeat(10) },
    { network: "ton", txHash: `ab/cd+${"A".repeat(38)}` }, // Base64 TON hashes are not linked
    { network: "aptos", txHash: `0x${HEX64}0` },
    { network: "eip155:999999", txHash: `0x${HEX64}` }, // unknown network
    { network: "unknown", txHash: HEX64 },
    { network: "", txHash: HEX64 },
    { network: "__proto__", txHash: HEX64 },
    { network: "constructor", txHash: HEX64 },
    { network: 1, txHash: HEX64 }, // non-string input
    { network: "eth", txHash: 12345 },
    { network: ["eth"], txHash: `0x${HEX64}` },
    { network: "eth", txHash: { hash: `0x${HEX64}` } },
    { network: "eth" },
    {},
  ];
  for (const args of rejected) {
    const { data, isError } = await callTool(handle, "get_tx_explorer_url", args);
    assert.equal(isError, false);
    const echo = (value) => (typeof value === "string" ? value : null); // only strings are echoed
    assert.deepEqual(data, { network: echo(args.network), txHash: echo(args.txHash), explorerUrl: null, valid: false }, JSON.stringify(args));
  }
  const noArgs = await callTool(handle, "get_tx_explorer_url");
  assert.equal(noArgs.data.valid, false);
});

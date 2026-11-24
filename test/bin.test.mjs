import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const binPath = fileURLToPath(new URL(`../${pkg.bin["allswap-mcp"]}`, import.meta.url));

const CATALOG = {
  version: "catalog-test",
  observedAt: "2026-11-20T00:00:00Z",
  stale: false,
  nextCursor: null,
  assets: [{ chainId: "tron:mainnet", symbol: "USDT", decimals: 6, quotable: true }],
};

/** Starts a local catalog stub so the end-to-end test makes no external request. */
async function startCatalogStub() {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === "/api/v2/assets") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(CATALOG));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  return { origin: `http://localhost:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)) };
}

/** Runs the bin, writes the given lines to stdin, closes stdin and returns the parsed stdout lines. */
function runBin(lines, env, nodeArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, binPath], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out; stdout=${stdout} stderr=${stderr}`));
    }, 10_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, replies: stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line)) });
    });
    child.stdin.end(lines.join("\n") + "\n");
  });
}

test("bin: line-delimited JSON-RPC over stdio, end to end", async (t) => {
  const stub = await startCatalogStub();
  t.after(stub.close);

  const { code, stderr, replies } = await runBin(
    [
      "{not json",
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      "",
      "   ",
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_supported_assets", arguments: { symbol: "usdt" } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_tx_explorer_url", arguments: { network: "btc", txHash: "ab".repeat(32) } } }),
      JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" }),
      JSON.stringify({ jsonrpc: "2.0", id: 6, method: "no/such/method" }),
      JSON.stringify({ jsonrpc: "2.0", method: "no/such/notification" }),
      JSON.stringify({ id: 7, method: "ping" }),
    ],
    { ALLSWAP_API_ORIGIN: stub.origin },
  );

  assert.equal(code, 0, stderr);
  assert.equal(stderr, "");
  // One reply per request with an id, plus the parse error; none for notifications or blank lines.
  assert.equal(replies.length, 8, JSON.stringify(replies));
  const byId = new Map(replies.filter((r) => r.id !== null).map((r) => [r.id, r]));

  const parseErrors = replies.filter((r) => r.id === null);
  assert.deepEqual(parseErrors, [{ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }]);

  assert.deepEqual(byId.get(1).result.serverInfo, { name: pkg.name, version: pkg.version });
  assert.equal(byId.get(1).result.protocolVersion, "2025-06-18");
  assert.deepEqual(byId.get(2).result.tools.map((tool) => tool.name), ["list_supported_assets", "get_official_channels", "get_tx_explorer_url"]);

  const assets = JSON.parse(byId.get(3).result.content[0].text);
  assert.equal(assets.matchedAssets, 1);
  assert.deepEqual(stub.requests, ["/api/v2/assets"]);

  assert.equal(JSON.parse(byId.get(4).result.content[0].text).explorerUrl, `https://mempool.space/tx/${"ab".repeat(32)}`);
  assert.deepEqual(byId.get(5).result, {});
  assert.equal(byId.get(6).error.code, -32601);
  assert.equal(byId.get(7).error.code, -32600);
});

test("bin: exits when stdin closes with no input", async () => {
  const { code, replies } = await runBin([], {});
  assert.equal(code, 0);
  assert.deepEqual(replies, []);
});

/**
 * Starts the bin and returns send(line) -> next reply line (parsed). Each line is written only after the
 * previous reply arrived, so a later answer proves the process survived the earlier line.
 */
function startInteractive(env = {}) {
  const child = spawn(process.execPath, [binPath], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  let stderr = "";
  const waiting = [];
  const lines = [];
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (waiting.length) waiting.shift()(line);
      else lines.push(line);
    }
  });
  const exited = new Promise((resolve) => child.on("close", (code) => resolve(code)));
  return {
    send(line) {
      child.stdin.write(`${line}\n`);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no reply; stderr=${stderr}`)), 10_000);
        const done = (text) => {
          clearTimeout(timer);
          resolve(JSON.parse(text));
        };
        if (lines.length) done(lines.shift());
        else waiting.push(done);
      });
    },
    async close() {
      child.stdin.end();
      return { code: await exited, stderr };
    },
  };
}

const DEEP = "[".repeat(20000) + "]".repeat(20000);
const PING = JSON.stringify({ jsonrpc: "2.0", id: 99, method: "ping" });

test("bin: hostile deeply nested values do not crash the process", async () => {
  const session = startInteractive();
  const hostile = {
    network: `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_tx_explorer_url","arguments":{"network":${DEEP},"txHash":"x"}}}`,
    name: `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":${DEEP},"arguments":{}}}`,
    id: `{"jsonrpc":"2.0","id":${DEEP},"method":"tools/call","params":{"name":"get_official_channels"}}`,
  };

  const r1 = await session.send(hostile.network);
  assert.equal(r1.id, 1);
  assert.deepEqual(JSON.parse(r1.result.content[0].text), { network: null, txHash: "x", explorerUrl: null, valid: false });
  assert.deepEqual(await session.send(PING), { jsonrpc: "2.0", id: 99, result: {} });

  const r2 = await session.send(hostile.name);
  assert.deepEqual(r2, { jsonrpc: "2.0", id: 2, error: { code: -32602, message: "Unknown tool: name must be a string" } });
  assert.deepEqual(await session.send(PING), { jsonrpc: "2.0", id: 99, result: {} });

  const r3 = await session.send(hostile.id);
  assert.deepEqual(r3, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } });
  const after = await session.send(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" }));
  assert.equal(after.id, 5);
  assert.equal(after.result.tools.length, 3);

  const { code, stderr } = await session.close();
  assert.equal(code, 0);
  assert.equal(stderr, "");
});

test("bin: a failure while handling or serialising answers -32603 and keeps running", async () => {
  // Make JSON.stringify throw for one specific successful reply, as an unexpected failure would.
  const patch =
    'const s=JSON.stringify;JSON.stringify=function(v,...r){if(v&&v.id==="boom"&&v.result)throw new RangeError("x");return s.call(this,v,...r)}';
  const { code, replies } = await runBin(
    [JSON.stringify({ jsonrpc: "2.0", id: "boom", method: "tools/list" }), PING],
    {},
    ["--import", `data:text/javascript,${encodeURIComponent(patch)}`],
  );
  assert.equal(code, 0);
  const byId = new Map(replies.map((r) => [r.id, r]));
  assert.deepEqual(byId.get("boom"), { jsonrpc: "2.0", id: "boom", error: { code: -32603, message: "Internal error" } });
  assert.deepEqual(byId.get(99), { jsonrpc: "2.0", id: 99, result: {} });
});

test("bin: an invalid ALLSWAP_API_ORIGIN exits non-zero with one line on stderr, before reading stdin", async () => {
  for (const origin of ["allswap.io", "ftp://allswap.io", "https://allswap.io/api", "https://allswap.io?x"]) {
    const { code, stderr, replies } = await runBin([PING], { ALLSWAP_API_ORIGIN: origin });
    assert.equal(code, 2, origin);
    assert.deepEqual(replies, [], "nothing was read or answered");
    assert.equal(stderr.trim().split("\n").length, 1);
    assert.match(stderr, /^allswap-mcp: invalid ALLSWAP_API_ORIGIN: apiOrigin must be an http\(s\) origin/);
  }
});

test("bin: the catalog request does not follow redirects", async (t) => {
  const stub = await startCatalogStub();
  t.after(stub.close);
  const { code, replies } = await runBin(
    [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_supported_assets", arguments: {} } })],
    { ALLSWAP_API_ORIGIN: stub.origin },
  );
  assert.equal(code, 0);
  assert.equal(replies[0].result.isError, undefined, "direct request works");

  // A server whose catalog path redirects is refused instead of followed.
  const redirecting = await startRedirectStub();
  t.after(redirecting.close);
  const result = await runBin(
    [JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_supported_assets", arguments: {} } })],
    { ALLSWAP_API_ORIGIN: redirecting.origin },
  );
  assert.equal(result.replies[0].result.isError, true);
  assert.equal(typeof JSON.parse(result.replies[0].result.content[0].text).error, "string");
  assert.deepEqual(redirecting.requests, ["/api/v2/assets"], "the redirect target was never requested");
});

/** A stub whose /api/v2/assets answers 302 to another path. */
async function startRedirectStub() {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === "/api/v2/assets") res.writeHead(302, { Location: "/elsewhere" }).end();
    else res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(CATALOG));
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  return { origin: `http://localhost:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)) };
}

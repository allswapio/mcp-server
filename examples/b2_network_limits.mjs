// The three limits of list_supported_assets, shown against a local HTTP server on 127.0.0.1 and a stub fetch:
// redirect refused, response body over the cap refused, timeout. Also prints the tool annotations.
// No outside network. Node.js 22. Usage: node b2_network_limits.mjs
import http from "node:http";
import { createMcpHandler, TOOLS } from "@allswapio/mcp-server";

const call = (handle) =>
  handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_supported_assets", arguments: {} } });
const text = (reply) => JSON.parse(reply.result.content[0].text);

// 1. A local server whose /api/v2/assets answers with a redirect.
const server = http.createServer((req, res) => res.writeHead(302, { Location: "/elsewhere" }).end());
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
let reply = await call(createMcpHandler({ apiOrigin: origin }));
console.log("redirect        ->", reply.result.isError, JSON.stringify(text(reply)));
server.close();

// 2. A body larger than maxBytes (here 1 KiB instead of 5 MiB), declared by Content-Length.
const big = JSON.stringify({ assets: [], pad: "x".repeat(2000) });
reply = await call(createMcpHandler({ maxBytes: 1024, fetchImpl: async () => new Response(big, { headers: { "content-length": String(big.length) } }) }));
console.log("body over cap   ->", reply.result.isError, JSON.stringify(text(reply)));

// 3. A fetch that never answers; the abort signal ends it after timeoutMs (here 50 ms instead of 8 s).
const started = Date.now();
reply = await call(
  createMcpHandler({
    timeoutMs: 50,
    fetchImpl: (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted by timeout")))),
  }),
);
console.log(`timeout         -> ${reply.result.isError} ${JSON.stringify(text(reply))} after ${Date.now() - started} ms`);

// 4. What request the server builds (the stub records it).
let seen;
await call(createMcpHandler({ apiOrigin: "https://example.test", fetchImpl: async (url, init) => ((seen = { url, method: init.method, redirect: init.redirect }), new Response('{"assets":[]}')) }));
console.log("request options ->", JSON.stringify(seen));

// 5. Annotations.
for (const t of TOOLS) console.log(`annotations     -> ${t.name.padEnd(22)} ${JSON.stringify(t.annotations)}`);

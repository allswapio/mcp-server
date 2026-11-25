// Three smaller edge cases, through the library entry point (no process, no network). Node.js 22.
import { createMcpHandler } from "@allswapio/mcp-server";
const handle = createMcpHandler();
const show = async (label, msg) => console.log(label.padEnd(34), JSON.stringify(await handle(msg)));

await show("id: null is answered, id null", { jsonrpc: "2.0", id: null, method: "ping" });
await show("network 'constructor' (prototype key)", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_tx_explorer_url", arguments: { network: "constructor", txHash: "a".repeat(64) } } });
await show("hash with a slash", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_tx_explorer_url", arguments: { network: "sol", txHash: "../".repeat(12) } } });
await show("unknown method without id", { jsonrpc: "2.0", method: "no/such" });
try { createMcpHandler({ apiOrigin: "https://allswap.io/api" }); } catch (e) { console.log("bad apiOrigin".padEnd(34), e.name + ": " + e.message); }

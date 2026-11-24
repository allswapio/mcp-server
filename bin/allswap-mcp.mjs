#!/usr/bin/env node
import readline from "node:readline";
import { createMcpHandler } from "../src/server.mjs";

let handleMessage;
try {
  handleMessage = createMcpHandler({
    apiOrigin: process.env.ALLSWAP_API_ORIGIN || "https://allswap.io",
  });
} catch (error) {
  process.stderr.write(`allswap-mcp: invalid ALLSWAP_API_ORIGIN: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function usableId(message) {
  const id = message && typeof message === "object" ? message.id : undefined;
  return id === null || typeof id === "string" || (typeof id === "number" && Number.isFinite(id)) ? id : null;
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  try {
    const reply = await handleMessage(parsed);
    if (reply !== null) process.stdout.write(`${JSON.stringify(reply)}\n`);
  } catch {
    // Handling or serialising failed: answer with an internal error instead of exiting.
    try {
      write({ jsonrpc: "2.0", id: usableId(parsed), error: { code: -32603, message: "Internal error" } });
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } });
    }
  }
});

export interface McpToolAnnotations {
  /** Always true: no tool changes anything. */
  readOnlyHint: true;
  /** True only for list_supported_assets, which makes an HTTPS request. */
  openWorldHint: boolean;
}

export interface McpTool {
  name: "list_supported_assets" | "get_official_channels" | "get_tx_explorer_url";
  description: string;
  inputSchema: {
    type: "object";
    additionalProperties: false;
    required?: string[];
    properties: Record<string, Record<string, unknown>>;
  };
  annotations: McpToolAnnotations;
}

/** The three tools, in the order tools/list returns them. */
export declare const TOOLS: readonly McpTool[];

export interface McpHandlerOptions {
  /**
   * Origin of the public asset catalog, such as "https://allswap.io" (http: or https:, no path, query or
   * credentials; one trailing slash is allowed). Default "https://allswap.io".
   */
  apiOrigin?: string;
  /** fetch implementation used by list_supported_assets. Default globalThis.fetch. */
  fetchImpl?: (
    url: string,
    init: { method: "GET"; headers: Record<string, string>; redirect: "error"; signal: AbortSignal },
  ) => Promise<Response>;
  /** Abort the catalog request after this many milliseconds. Default 8000. */
  timeoutMs?: number;
  /** Refuse a catalog response body larger than this many bytes. Default 5 MiB (5242880). */
  maxBytes?: number;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Returns a function that handles one parsed JSON-RPC 2.0 message and resolves to the response,
 * or to null when no response is due (notifications).
 * @throws {TypeError} when `apiOrigin` is not an http(s) origin.
 */
export declare function createMcpHandler(options?: McpHandlerOptions): (message: unknown) => Promise<JsonRpcResponse | null>;

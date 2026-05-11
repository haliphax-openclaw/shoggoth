/**
 * Service Tool Dispatcher - Handles HTTP dispatching of tool calls to external services
 *
 * Phase 3: Manifest Fetching & Plugin Tool Registration
 */

import type { ServiceEntry } from "./service-registry";
import type { TokenMinter } from "./service-auth";
import type { ServiceToolDeclaration } from "@shoggoth/shared";

/**
 * Context passed to the dispatcher containing agent and session information.
 */
export interface DispatchContext {
  /** The agent ID making the request */
  agentId: string;
  /** The session URN */
  sessionUrn: string;
  /** The service entry being invoked */
  serviceEntry: ServiceEntry;
}

/**
 * ServiceToolDispatcher handles HTTP dispatching of tool calls to external services.
 * It mints authentication tokens and forwards tool invocations to the appropriate
 * service endpoints based on the tool declaration.
 */
export class ServiceToolDispatcher {
  private tokenMinter: TokenMinter;

  constructor(tokenMinter: TokenMinter) {
    this.tokenMinter = tokenMinter;
  }

  /**
   * Dispatch a tool call to the appropriate service endpoint.
   *
   * @param toolDecl - The tool declaration from the service manifest
   * @param args - The arguments to pass to the tool
   * @param ctx - The dispatch context
   * @returns The result from the service as a JSON string
   */
  async dispatch(
    toolDecl: ServiceToolDeclaration,
    args: Record<string, unknown>,
    ctx: DispatchContext,
  ): Promise<{ resultJson: string }> {
    // Get service URL from context
    const serviceUrl = ctx.serviceEntry.url;

    // Mint authentication token
    const token = await this.tokenMinter.mint(ctx.agentId, ctx.serviceEntry.id, ctx.sessionUrn);

    // Determine dispatch mode (default to 'body')
    const dispatchMode = toolDecl.dispatch ?? "body";

    // Build the full URL with path and query params based on dispatch mode
    let url: string;
    let fetchOptions: RequestInit;

    switch (dispatchMode) {
      case "query": {
        // Append args as URL search params
        const urlObj = new URL(toolDecl.path, serviceUrl);
        for (const [key, value] of Object.entries(args)) {
          urlObj.searchParams.append(key, String(value));
        }
        url = urlObj.toString();
        fetchOptions = {
          method: toolDecl.method,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };
        break;
      }

      case "path": {
        // Replace {param} placeholders in path with arg values
        let path = toolDecl.path;
        for (const [key, value] of Object.entries(args)) {
          const placeholder = `{${key}}`;
          path = path.replace(placeholder, String(value));
        }
        url = new URL(path, serviceUrl).toString();
        fetchOptions = {
          method: toolDecl.method,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };
        break;
      }

      case "body":
      default: {
        // Default: POST/PUT/etc with JSON body
        url = new URL(toolDecl.path, serviceUrl).toString();
        fetchOptions = {
          method: toolDecl.method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        };
        break;
      }
    }

    // Make the HTTP request
    const response = await fetch(url, fetchOptions);

    // Check for errors
    if (!response.ok) {
      throw new Error(`${response.status}`);
    }

    // Return the response as a JSON string
    const resultJson =
      response.text !== undefined ? await response.text() : JSON.stringify(await response.json());
    return { resultJson };
  }
}

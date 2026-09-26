import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { experimental_ValibotToJsonSchemaConverter as ValibotToJsonSchemaConverter } from "@orpc/valibot";

import type { ApiContext } from "./context";
import type { ApiDependencies, RequestContext } from "./core/context";

import { handlePublicFileRequest } from "./files/public";
import { handleFileRequest } from "./files/routes";
import { legacyUnavailable } from "./legacy";
import { router } from "./router";

export function createApp(dependencies: ApiDependencies) {
  const rpc = new RPCHandler<RequestContext & ApiContext>(router);
  const api = new OpenAPIHandler<RequestContext & ApiContext>(router);
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ValibotToJsonSchemaConverter()],
  });
  const specification = generator.generate(router, {
    info: { title: "Farida LMS API", version: "1.0.0" },
    servers: [{ url: "/v1" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
  });

  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    const url = new URL(request.url);
    let response: Response;
    try {
      if (url.pathname === "/health/live")
        response = Response.json({ status: "ok" });
      else if (url.pathname === "/health/ready") {
        await dependencies.cell.ping();
        response = Response.json({ status: "ok" });
      } else if (url.pathname === "/openapi.json")
        response = Response.json(await specification);
      else {
        const context: RequestContext & ApiContext = {
          ...dependencies,
          control: legacyUnavailable,
          pools: legacyUnavailable,
          headers: request.headers,
          requestId,
        };
        const file =
          (await handlePublicFileRequest(request, url, context)) ??
          (await handleFileRequest(request, url, context));
        if (file) response = file;
        else {
          const handler = url.pathname.startsWith("/rpc/") ? rpc : api;
          const result = await handler.handle(request, {
            prefix: handler === rpc ? "/rpc" : "/v1",
            context,
          });
          response =
            result.response ??
            Response.json({ code: "NOT_FOUND" }, { status: 404 });
        }
      }
    } catch (error) {
      console.error(JSON.stringify({ requestId, error: String(error) }));
      response = Response.json(
        { code: "INTERNAL_SERVER_ERROR", requestId },
        { status: 500 },
      );
    }
    response.headers.set("x-request-id", requestId);
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-content-type-options", "nosniff");
    console.info(
      JSON.stringify({
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    return response;
  };
}

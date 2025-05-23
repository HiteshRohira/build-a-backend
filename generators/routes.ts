import { writeFileSync, ensureDirSync } from "fs-extra";
import path from "node:path";
import * as Handlebars from "handlebars";
import type { ParsedEndpoint } from "../parsers/openapi.js";
import type { OpenAPIV3 } from "openapi-types";

const routeTemplate = `import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema, IdParamsSchema } from "stoker/openapi/schemas";

{{#if schemas}}
import { {{#each schemas}}{{name}}Schema{{#unless @last}}, {{/unless}}{{/each}} } from "@/db/schema";
{{/if}}
import { notFoundSchema } from "@/lib/constants";

const tags = ["{{capitalize tag}}"];

{{#each endpoints}}
export const {{camelCase operationId}} = createRoute({
  path: "{{path}}",
  method: "{{lowercase method}}",
  {{#if parameters}}
  request: {
    {{#if pathParams}}
    params: z.object({
      {{#each pathParams}}
      {{name}}: {{zodType schema}},
      {{/each}}
    }),
    {{/if}}
    {{#if queryParams}}
    query: z.object({
      {{#each queryParams}}
      {{name}}: {{zodType schema}}{{#unless required}}.optional(){{/unless}},
      {{/each}}
    }),
    {{/if}}
    {{#if requestBody}}
    body: jsonContentRequired(
      {{getSchemaName requestBody}},
      "{{description}}"
    ),
    {{/if}}
  },
  {{/if}}
  tags,
  responses: {
    {{#each responses}}
    [HttpStatusCodes.{{statusCodeConstant statusCode}}]: {{#if content}}jsonContent(
      {{getResponseSchema content}},
      "{{description}}"
    ){{else}}{
      description: "{{description}}"
    }{{/if}},
    {{/each}}
  },
});

{{/each}}

{{#each endpoints}}
export type {{pascalCase operationId}}Route = typeof {{camelCase operationId}};
{{/each}}
`;

export async function generateRoutes(
  targetDir: string,
  endpoints: ParsedEndpoint[],
): Promise<void> {
  // Group endpoints by tags
  const endpointsByTag = endpoints.reduce(
    (acc, endpoint) => {
      const tag = endpoint.tags[0] || "default";
      if (!acc[tag]) acc[tag] = [];
      acc[tag].push(endpoint);
      return acc;
    },
    {} as Record<string, ParsedEndpoint[]>,
  );

  // Register Handlebars helpers
  registerHandlebarsHelpers();

  const template = Handlebars.compile(routeTemplate);

  for (const [tag, tagEndpoints] of Object.entries(endpointsByTag)) {
    const routesDir = path.join(targetDir, "src", "routes");
    ensureDirSync(routesDir);

    const fileName = `${tag.toLowerCase()}.routes.ts`;
    const filePath = path.join(routesDir, fileName);

    const content = template({
      tag,
      endpoints: tagEndpoints.map((endpoint) => ({
        ...endpoint,
        pathParams: endpoint.parameters.filter((p) => p.in === "path"),
        queryParams: endpoint.parameters.filter((p) => p.in === "query"),
      })),
    });

    writeFileSync(filePath, content);
  }
}

function registerHandlebarsHelpers() {
  Handlebars.registerHelper("camelCase", (str: string) => {
    return str.charAt(0).toLowerCase() + str.slice(1);
  });

  Handlebars.registerHelper("pascalCase", (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper("capitalize", (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper("lowercase", (str: string) => {
    return str.toLowerCase();
  });

  Handlebars.registerHelper("zodType", (schema: OpenAPIV3.SchemaObject) => {
    // Convert OpenAPI schema to Zod type
    if (!schema) return "z.unknown()";

    switch (schema.type) {
      case "string":
        return "z.string()";
      case "number":
        return "z.number()";
      case "integer":
        return "z.number().int()";
      case "boolean":
        return "z.boolean()";
      case "array":
        // @ts-ignore
        return `z.array(${zodType(schema.items as OpenAPIV3.SchemaObject)})`;
      default:
        return "z.unknown()";
    }
  });

  Handlebars.registerHelper("statusCodeConstant", (code: string) => {
    const codeMap: Record<string, string> = {
      "200": "OK",
      "201": "CREATED",
      "204": "NO_CONTENT",
      "400": "BAD_REQUEST",
      "401": "UNAUTHORIZED",
      "404": "NOT_FOUND",
      "422": "UNPROCESSABLE_ENTITY",
      "500": "INTERNAL_SERVER_ERROR",
    };
    return codeMap[code] || code;
  });
}

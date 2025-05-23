import { writeFileSync, ensureDirSync } from "fs-extra";
import path from "node:path";
import * as Handlebars from "handlebars";
import type { ParsedEndpoint } from "../parsers/openapi.js";

const handlerTemplate = `import * as HttpStatusCodes from "stoker/http-status-codes";
import * as HttpStatusPhrases from "stoker/http-status-phrases";

import type { AppRouteHandler } from "@/lib/types";
import db from "@/db";
{{#if hasDatabase}}
import { {{tableName}} } from "@/db/schema";
{{/if}}

{{#each routes}}
import type { {{pascalCase operationId}}Route } from "./{{../tag}}.routes";
{{/each}}

{{#each endpoints}}
export const {{camelCase operationId}}: AppRouteHandler<{{pascalCase operationId}}Route> = async (c) => {
  {{#if pathParams}}
  const { {{#each pathParams}}{{name}}{{#unless @last}}, {{/unless}}{{/each}} } = c.req.valid("param");
  {{/if}}
  {{#if queryParams}}
  const { {{#each queryParams}}{{name}}{{#unless @last}}, {{/unless}}{{/each}} } = c.req.valid("query");
  {{/if}}
  {{#if requestBody}}
  const body = c.req.valid("json");
  {{/if}}

  // TODO: Implement {{operationId}} logic
  {{#if (eq method "GET")}}
  {{#if pathParams}}
  // TODO: Fetch single {{../tag}} by ID
  const item = await db.query.{{../tableName}}.findFirst({
    where: (fields, operators) => operators.eq(fields.id, {{#each pathParams}}{{name}}{{/each}})
  });

  if (!item) {
    return c.json(
      { message: HttpStatusPhrases.NOT_FOUND },
      HttpStatusCodes.NOT_FOUND
    );
  }

  return c.json(item);
  {{else}}
  // TODO: Fetch all {{../tag}}s
  const items = await db.query.{{../tableName}}.findMany();
  return c.json(items);
  {{/if}}
  {{else if (eq method "POST")}}
  // TODO: Create new {{../tag}}
  const [created] = await db.insert({{../tableName}}).values(body).returning();
  return c.json(created, HttpStatusCodes.CREATED);
  {{else if (eq method "PATCH")}}
  // TODO: Update {{../tag}}
  const [updated] = await db.update({{../tableName}})
    .set(body)
    .where(eq({{../tableName}}.id, {{#each pathParams}}{{name}}{{/each}}))
    .returning();

  if (!updated) {
    return c.json(
      { message: HttpStatusPhrases.NOT_FOUND },
      HttpStatusCodes.NOT_FOUND
    );
  }

  return c.json(updated);
  {{else if (eq method "DELETE")}}
  // TODO: Delete {{../tag}}
  const result = await db.delete({{../tableName}})
    .where(eq({{../tableName}}.id, {{#each pathParams}}{{name}}{{/each}}));

  if (result.rowsAffected === 0) {
    return c.json(
      { message: HttpStatusPhrases.NOT_FOUND },
      HttpStatusCodes.NOT_FOUND
    );
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT);
  {{else}}
  // TODO: Implement {{method}} {{path}}
  return c.json({ message: "Not implemented" }, HttpStatusCodes.NOT_IMPLEMENTED);
  {{/if}}
};

{{/each}}
`;

export async function generateHandlers(
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

  // Register additional helpers
  Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

  const template = Handlebars.compile(handlerTemplate);

  for (const [tag, tagEndpoints] of Object.entries(endpointsByTag)) {
    const routesDir = path.join(targetDir, "src", "routes");
    ensureDirSync(routesDir);

    const fileName = `${tag.toLowerCase()}.handlers.ts`;
    const filePath = path.join(routesDir, fileName);

    const content = template({
      tag,
      tableName: tag.toLowerCase(),
      hasDatabase: true,
      endpoints: tagEndpoints.map((endpoint) => ({
        ...endpoint,
        pathParams: endpoint.parameters.filter((p) => p.in === "path"),
        queryParams: endpoint.parameters.filter((p) => p.in === "query"),
      })),
    });

    writeFileSync(filePath, content);
  }
}

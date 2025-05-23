import { writeFileSync } from "fs-extra";
import path from "node:path";
import * as Handlebars from "handlebars";
import type { ParsedSchema } from "../parsers/openapi.js";
import type { OpenAPIV3 } from "openapi-types";

const schemaTemplate = `import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

{{#each schemas}}
export const {{camelCase name}} = sqliteTable("{{snakeCase name}}", {
  {{#each properties}}
  {{@key}}: {{drizzleType this}},
  {{/each}}
});

export const insert{{pascalCase name}}Schema = createInsertSchema({{camelCase name}});
export const select{{pascalCase name}}Schema = createSelectSchema({{camelCase name}});
export const patch{{pascalCase name}}Schema = insert{{pascalCase name}}Schema.partial();

{{/each}}
`;

export async function generateSchema(
  targetDir: string,
  schemas: ParsedSchema[],
  dbTyp = "sqlite",
): Promise<void> {
  if (schemas.length === 0) return;

  // Register Drizzle-specific helpers
  Handlebars.registerHelper(
    "drizzleType",
    (property: OpenAPIV3.SchemaObject) => {
      switch (property.type) {
        case "string":
          return "text()";
        case "integer":
          return "integer()";
        case "number":
          return "real()";
        case "boolean":
          return 'integer({ mode: "boolean" })';
        default:
          return "text()";
      }
    },
  );

  Handlebars.registerHelper("snakeCase", (str: string) => {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  });

  const template = Handlebars.compile(schemaTemplate);
  const schemaPath = path.join(targetDir, "src", "db", "schema.ts");

  const content = template({ schemas });
  writeFileSync(schemaPath, content);
}

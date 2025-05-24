import { Command } from "commander";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  ensureDirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copySync,
  lstatSync,
} from "fs-extra";
import * as Handlebars from "handlebars";
import { createSpinner } from "nanospinner";
import {
  parseOpenAPISpec,
  type ParsedOpenAPI,
  type ParsedEndpoint,
  type ParsedSchema,
} from "../parsers/openapi.js";
import { generateRoutes } from "../generators/routes.js";
import { generateHandlers } from "../generators/handlers.js";
import { generateSchema } from "../generators/schema.js";

interface Options {
  cors: boolean;
  auth: boolean;
  spec?: string;
  database?: "sqlite" | "postgres" | "mysql";
}

interface TemplateData {
  name: string;
  cors: boolean;
  auth: boolean;
  database: string | undefined;
  endpoints: ParsedEndpoint[];
  schemas: ParsedSchema[];
}

const program = new Command();

program
  .name("create-hono-app")
  .description("Scaffold a Hono app from an OpenAPI spec file")
  .argument("<app-name>")
  .option("-s, --spec <path>", "OpenAPI specification file path")
  .option("-c, --cors", "Enable CORS")
  .option("-a, --auth", "Enable JWT auth")
  .option("-d, --database <type>", "Database type", "sqlite")
  .action(async (appName: string, opts: Options) => {
    const spinner = createSpinner("Creating Hono application...").start();

    try {
      // Validate inputs
      validateAppName(appName);

      const target = path.resolve(process.cwd(), appName);
      if (existsSync(target)) {
        throw new Error(`Folder "${appName}" already exists.`);
      }

      // Parse OpenAPI spec if provided
      let parsedSpec: ParsedOpenAPI;
      if (opts.spec) {
        if (!existsSync(opts.spec)) {
          throw new Error(`OpenAPI spec file not found: ${opts.spec}`);
        }
        spinner.update({ text: "Parsing OpenAPI specification..." });
        parsedSpec = parseOpenAPISpec(opts.spec);

        ensureDirSync(target);

        const tplRoot = path.join(__dirname, "../templates/app");
        const templateData = {
          name: appName,
          cors: opts.cors,
          auth: opts.auth,
          database: opts.database,
          ...parsedSpec,
        };

        spinner.update({ text: "Generating project structure..." });
        if (templateData.endpoints !== undefined) {
          await walk(tplRoot, target, templateData);
        } else {
          throw new Error("No endpoints found in OpenAPI spec");
        }

        // Generate additional files if OpenAPI spec is provided
        if (parsedSpec) {
          spinner.update({ text: "Generating routes and handlers..." });
          await generateRoutes(target, parsedSpec.endpoints);
          await generateHandlers(target, parsedSpec.endpoints);
          await generateSchema(target, parsedSpec.schemas, opts.database);
        }

        spinner.success({ text: `✨ Generated "${appName}"` });

        console.log("\n📁 Next steps:");
        console.log(`  cd ${appName}`);
        console.log("  pnpm install");
        if (parsedSpec) {
          console.log("  pnpm db:generate");
          console.log("  pnpm db:migrate");
        }
        console.log("  pnpm dev");
      }
    } catch (error) {
      spinner.error({ text: "Failed to create application" });
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ ${errorMessage}`);
      process.exit(1);
    }
  });

function validateAppName(appName: string): void {
  if (!appName || appName.trim().length === 0) {
    throw new Error("App name cannot be empty");
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(appName)) {
    throw new Error(
      "App name can only contain letters, numbers, hyphens, and underscores",
    );
  }
}

async function walk(
  src: string,
  dest: string,
  templateData: TemplateData,
): Promise<void> {
  for (const name of readdirSync(src)) {
    const srcPath = path.join(src, name);
    const destName = name.replace(/\.hbs$/, "");
    const destPath = path.join(dest, destName);

    if (lstatSync(srcPath).isDirectory()) {
      ensureDirSync(destPath);
      await walk(srcPath, destPath, templateData);
    } else if (name.endsWith(".hbs")) {
      const tpl = readFileSync(srcPath, "utf8");
      const rendered = Handlebars.compile(tpl)(templateData);
      writeFileSync(destPath, rendered);
    } else {
      copySync(srcPath, destPath);
    }
  }
}

program.parse();

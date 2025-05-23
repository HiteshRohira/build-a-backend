// src/parsers/openapi.ts
import type { OpenAPIV3 } from "openapi-types";
import { readFileSync } from "fs-extra";
import yaml from "js-yaml";

export interface ParsedEndpoint {
  path: string;
  method: string;
  operationId: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: ParsedResponse[];
}

export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  schema: unknown;
}

export interface ParsedRequestBody {
  required: boolean;
  content: Record<string, unknown>;
}

export interface ParsedResponse {
  statusCode: string;
  description: string;
  content?: Record<string, unknown>;
}

export interface ParsedSchema {
  name: string;
  properties: Record<string, unknown>;
  required: string[];
}

export interface ParsedOpenAPI {
  endpoints: ParsedEndpoint[];
  schemas: ParsedSchema[];
  info: {
    title: string;
    version: string;
    description?: string;
  };
}

// Main parsing function
export function parseOpenAPISpec(specPath: string): ParsedOpenAPI {
  const spec = loadOpenAPISpec(specPath);

  return {
    endpoints: parseEndpoints(spec),
    schemas: parseSchemas(spec),
    info: {
      title: spec.info.title,
      version: spec.info.version,
      description: spec.info.description,
    },
  };
}

// Helper functions
function loadOpenAPISpec(specPath: string): OpenAPIV3.Document {
  const content = readFileSync(specPath, "utf8");

  if (specPath.endsWith(".yaml") || specPath.endsWith(".yml")) {
    return yaml.load(content) as OpenAPIV3.Document;
  }
  return JSON.parse(content);
}

function parseEndpoints(spec: OpenAPIV3.Document): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = [];

  Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
    if (!pathItem) return;

    Object.entries(pathItem).forEach(([method, operation]) => {
      if (method === "parameters" || !operation) return;

      const op = operation as OpenAPIV3.OperationObject;

      endpoints.push({
        path,
        method: method.toUpperCase(),
        operationId: op.operationId || generateOperationId(method, path),
        summary: op.summary,
        description: op.description,
        tags: op.tags || ["default"],
        parameters: parseParameters(op.parameters || []),
        requestBody: parseRequestBody(op.requestBody),
        responses: parseResponses(op.responses || {}),
      });
    });
  });

  return endpoints;
}

function parseSchemas(spec: OpenAPIV3.Document): ParsedSchema[] {
  const schemas: ParsedSchema[] = [];
  const components = spec.components?.schemas || {};

  Object.entries(components).forEach(([name, schema]) => {
    if (schema && typeof schema === "object" && "properties" in schema) {
      schemas.push({
        name,
        properties: schema.properties || {},
        required: schema.required || [],
      });
    }
  });

  return schemas;
}

function parseParameters(
  parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[],
): ParsedParameter[] {
  return parameters.map((param) => {
    if ("$ref" in param) {
      throw new Error("Parameter references not yet supported");
    }

    return {
      name: param.name,
      in: param.in as "path" | "query" | "header",
      required: param.required || false,
      schema: param.schema,
    };
  });
}

function parseRequestBody(
  requestBody?: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject,
): ParsedRequestBody | undefined {
  if (!requestBody || "$ref" in requestBody) return undefined;

  return {
    required: requestBody.required || false,
    content: requestBody.content || {},
  };
}

function parseResponses(
  responses: OpenAPIV3.ResponsesObject,
): ParsedResponse[] {
  return Object.entries(responses).map(([statusCode, response]) => {
    if ("$ref" in response) {
      throw new Error("Response references not yet supported");
    }

    return {
      statusCode,
      description: response.description,
      content: response.content,
    };
  });
}

function generateOperationId(method: string, path: string): string {
  return `${method}${path.replace(/[^a-zA-Z0-9]/g, "")}`;
}

// Utility functions for specific use cases
export function getEndpointsByTag(
  endpoints: ParsedEndpoint[],
): Record<string, ParsedEndpoint[]> {
  return endpoints.reduce(
    (acc, endpoint) => {
      const tag = endpoint.tags[0] || "default";
      if (!acc[tag]) acc[tag] = [];
      acc[tag].push(endpoint);
      return acc;
    },
    {} as Record<string, ParsedEndpoint[]>,
  );
}

export function getSchemaByName(
  schemas: ParsedSchema[],
  name: string,
): ParsedSchema | undefined {
  return schemas.find((schema) => schema.name === name);
}

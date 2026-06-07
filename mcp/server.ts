#!/usr/bin/env node
// Caseworker MCP server.
//
// Exposes Caseworker's advocacy capabilities as Model Context Protocol tools so
// ANY MCP client — Claude Desktop, Cursor, the agent hackathon harnesses, or
// another agent — can read a bureaucratic document and get a structured plan +
// a drafted response. This is what makes Caseworker eligible for the MCP and
// agent-platform tracks: it isn't just an app, it's a reusable agent tool.
//
// Run:  npm run mcp        (node --experimental-strip-types mcp/server.ts)
// Or wire it into an MCP client via stdio (see README).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runCaseworker, DOMAINS } from "../lib/caseworker.ts";

const server = new McpServer({
  name: "caseworker",
  version: "0.1.0",
});

const domainEnum = DOMAINS.map((d) => d.id) as [string, ...string[]];

server.registerTool(
  "list_domains",
  {
    title: "List supported case types",
    description:
      "Return the categories of bureaucratic documents Caseworker can handle (benefits, insurance, medical billing, financial aid, small-business licensing).",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(DOMAINS, null, 2) }],
  })
);

server.registerTool(
  "analyze_document",
  {
    title: "Analyze a bureaucratic document",
    description:
      "Read a benefits denial, insurance EOB, medical bill, financial-aid letter, or licensing decision. Returns a plain-language summary, the person's rights, every deadline, ordered next actions, and a ready-to-send drafted response.",
    inputSchema: {
      documentText: z
        .string()
        .describe("The full text of the letter/bill/notice the person received."),
      domain: z
        .enum(domainEnum)
        .optional()
        .describe("The case type. Defaults to 'benefits' if omitted."),
    },
  },
  async ({ documentText, domain }) => {
    const analysis = await runCaseworker(documentText, domain ?? "benefits");
    return {
      content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
    };
  }
);

server.registerTool(
  "draft_appeal",
  {
    title: "Draft an appeal / response letter",
    description:
      "Given the document text, return ONLY the ready-to-send appeal or dispute letter (title + body).",
    inputSchema: {
      documentText: z.string(),
      domain: z.enum(domainEnum).optional(),
    },
  },
  async ({ documentText, domain }) => {
    const analysis = await runCaseworker(documentText, domain ?? "benefits");
    return {
      content: [
        {
          type: "text",
          text: `# ${analysis.draftResponse.title}\n\n${analysis.draftResponse.body}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Caseworker MCP server running on stdio.");

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read the entire contents of a file at the given absolute path.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file." },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write the given content to the file at the given absolute path, overwriting any existing file.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file." },
        content: { type: "string", description: "Content to write." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "bash",
    description:
      "Run a shell command and return stdout. Use this for filesystem listing, running scripts, or any shell operation.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute." },
      },
      required: ["command"],
    },
  },
  {
    name: "grep_search",
    description:
      "Search for a regex pattern across files under the given directory. Returns matching file paths.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression to search for." },
        directory: { type: "string", description: "Absolute directory path to search." },
      },
      required: ["pattern", "directory"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch a web page and return its title and a short summary of the body text.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute http(s) URL to fetch." },
      },
      required: ["url"],
    },
  },
];

export type ToolExecutor = (input: Record<string, unknown>) => string;

const WEB_FIXTURES: Record<string, string> = {
  "https://example.com/ready":
    'Title: "Ready Page" — Summary: This fixture confirms the web_fetch tool was invoked with the expected URL.',
};

export function makeRegistry(opts: {
  workspaceDir: string;
  bashAllowlist: ReadonlyArray<RegExp>;
}): Record<string, ToolExecutor> {
  const { workspaceDir, bashAllowlist } = opts;

  const inWorkspace = (path: string): boolean =>
    path.startsWith(workspaceDir + "/") || path === workspaceDir;

  return {
    read_file: (input) => {
      const path = String(input.path ?? "");
      if (!inWorkspace(path)) {
        throw new Error(`Refused: path ${path} is outside workspace ${workspaceDir}`);
      }
      return readFileSync(path, "utf8");
    },

    write_file: (input) => {
      const path = String(input.path ?? "");
      const content = String(input.content ?? "");
      if (!inWorkspace(path)) {
        throw new Error(`Refused: path ${path} is outside workspace ${workspaceDir}`);
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
      return `Wrote ${content.length} bytes to ${path}`;
    },

    bash: (input) => {
      const command = String(input.command ?? "");
      const allowed = bashAllowlist.some((re) => re.test(command));
      if (!allowed) {
        throw new Error(
          `Refused: command "${command}" does not match the PoC allowlist (${bashAllowlist.map((r) => r.source).join(", ")})`,
        );
      }
      const stdout = execFileSync("/bin/sh", ["-c", command], {
        cwd: workspaceDir,
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
      return stdout.length > 0 ? stdout : "(empty stdout)";
    },

    grep_search: (input) => {
      const pattern = String(input.pattern ?? "");
      const directory = String(input.directory ?? "");
      if (!inWorkspace(directory)) {
        throw new Error(`Refused: directory ${directory} is outside workspace ${workspaceDir}`);
      }
      try {
        const stdout = execFileSync(
          "/usr/bin/grep",
          ["-rlE", pattern, directory],
          { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 },
        );
        return stdout.trim() || "(no matches)";
      } catch (err) {
        const code = (err as { status?: number }).status;
        if (code === 1) return "(no matches)";
        throw err;
      }
    },

    web_fetch: (input) => {
      const url = String(input.url ?? "");
      const fixture = WEB_FIXTURES[url];
      if (fixture) return fixture;
      throw new Error(
        `web_fetch fixture not registered for URL "${url}". PoC does not make real network calls.`,
      );
    },
  };
}

export const WEB_FETCH_FIXTURE_URLS: ReadonlyArray<string> = Object.keys(WEB_FIXTURES);

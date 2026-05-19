export interface ScenarioExpectation {
  toolName: string;
  inputContains?: Record<string, string>;
}

export interface Scenario {
  id: string;
  title: string;
  prompt: (workspaceDir: string) => string;
  expectedTools: ScenarioExpectation[];
  expectedFinalTextContains?: string[];
  setup?: (workspaceDir: string) => void | Promise<void>;
  postCheck?: (workspaceDir: string) => boolean;
  maxIterations: number;
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const SCENARIOS: Scenario[] = [
  {
    id: "S1-read-file",
    title: "Single tool: read_file and quote the contents",
    prompt: (ws) =>
      `Inside the workspace ${ws}, there is a file at ${ws}/note.txt. Use the read_file tool to read it, then in your final reply state EXACTLY what the file contains as a single quoted line. Do not invent content. Use the tool.`,
    expectedTools: [{ toolName: "read_file", inputContains: { path: "note.txt" } }],
    expectedFinalTextContains: ["the answer is 42"],
    setup: (ws) => {
      mkdirSync(ws, { recursive: true });
      writeFileSync(join(ws, "note.txt"), "the answer is 42\n", "utf8");
    },
    maxIterations: 4,
  },
  {
    id: "S2-write-file",
    title: "Single tool: write_file with given content",
    prompt: (ws) =>
      `Create a file at ${ws}/output.txt containing exactly the text: hello from gemma. Use the write_file tool. After the tool succeeds, reply with the single word OK.`,
    expectedTools: [
      { toolName: "write_file", inputContains: { path: "output.txt", content: "hello from gemma" } },
    ],
    expectedFinalTextContains: ["OK"],
    setup: (ws) => {
      mkdirSync(ws, { recursive: true });
    },
    postCheck: (ws) => {
      const path = join(ws, "output.txt");
      if (!existsSync(path)) return false;
      return readFileSync(path, "utf8").includes("hello from gemma");
    },
    maxIterations: 4,
  },
  {
    id: "S3-bash-ls",
    title: "Single tool: bash to list workspace contents",
    prompt: (ws) =>
      `List the files in ${ws} using the bash tool with the command "ls". After the tool returns, in your final reply name one file you saw, prefixed with FILE:.`,
    expectedTools: [{ toolName: "bash", inputContains: { command: "ls" } }],
    expectedFinalTextContains: ["FILE:"],
    setup: (ws) => {
      mkdirSync(ws, { recursive: true });
      writeFileSync(join(ws, "alpha.md"), "a", "utf8");
      writeFileSync(join(ws, "beta.md"), "b", "utf8");
    },
    maxIterations: 4,
  },
  {
    id: "S4-grep-then-read",
    title: "Tool chain: grep_search then read_file",
    prompt: (ws) =>
      `Find files under ${ws} that contain the regex "TARGET_TOKEN" using grep_search. Then read the matching file with read_file. In your final reply, state on a line beginning with VALUE: the value that follows TARGET_TOKEN= in that file.`,
    expectedTools: [
      { toolName: "grep_search", inputContains: { pattern: "TARGET_TOKEN", directory: "" } },
      { toolName: "read_file" },
    ],
    expectedFinalTextContains: ["VALUE:", "carrot"],
    setup: (ws) => {
      mkdirSync(ws, { recursive: true });
      writeFileSync(join(ws, "a.txt"), "nothing here\n", "utf8");
      writeFileSync(join(ws, "b.txt"), "TARGET_TOKEN=carrot\n", "utf8");
      writeFileSync(join(ws, "c.txt"), "also nothing\n", "utf8");
    },
    maxIterations: 6,
  },
  {
    id: "S5-web-fetch",
    title: "Single tool: web_fetch with a specific URL (fixture)",
    prompt: () =>
      `Use the web_fetch tool to fetch the URL https://example.com/ready. Then in your final reply, include the word READY.`,
    expectedTools: [
      { toolName: "web_fetch", inputContains: { url: "https://example.com/ready" } },
    ],
    expectedFinalTextContains: ["READY"],
    maxIterations: 4,
  },
];

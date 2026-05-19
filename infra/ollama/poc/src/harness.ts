import Anthropic from "@anthropic-ai/sdk";
import type { Scenario } from "./scenarios.js";
import type { ToolExecutor } from "./tools.js";
import { TOOLS } from "./tools.js";

export interface ToolCall {
  turn: number;
  name: string;
  input: Record<string, unknown>;
  result: string;
  errored: boolean;
}

export type RunOutcome =
  | "success"
  | "wrong_tool"
  | "missing_tool"
  | "bad_input"
  | "text_instead_of_tool"
  | "max_iterations"
  | "max_tokens"
  | "tool_execution_failed"
  | "post_check_failed"
  | "missing_final_text"
  | "api_error"
  | "unexpected_stop_reason";

export interface RunResult {
  scenarioId: string;
  iteration: number;
  outcome: RunOutcome;
  toolCalls: ToolCall[];
  finalText: string;
  turns: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  detail: string;
}

export interface RunHarnessOptions {
  client: Anthropic;
  model: string;
  scenario: Scenario;
  workspaceDir: string;
  registry: Record<string, ToolExecutor>;
  iteration: number;
  requestTimeoutMs: number;
  logger?: (msg: string) => void;
}

export async function runScenarioOnce(opts: RunHarnessOptions): Promise<RunResult> {
  const { client, model, scenario, workspaceDir, registry, iteration, requestTimeoutMs } = opts;
  const log = opts.logger ?? (() => {});

  const start = Date.now();
  const toolCalls: ToolCall[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let turns = 0;

  if (scenario.setup) {
    await scenario.setup(workspaceDir);
  }

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: scenario.prompt(workspaceDir) },
  ];

  const finalize = (
    outcome: RunOutcome,
    detail: string,
    finalText: string,
  ): RunResult => ({
    scenarioId: scenario.id,
    iteration,
    outcome,
    toolCalls,
    finalText,
    turns,
    durationMs: Date.now() - start,
    inputTokens,
    outputTokens,
    detail,
  });

  for (let i = 0; i < scenario.maxIterations; i++) {
    turns++;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create(
        {
          model,
          max_tokens: 2048,
          messages,
          tools: TOOLS,
        },
        { timeout: requestTimeoutMs, maxRetries: 0 },
      );
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        return finalize(
          "api_error",
          `APIError status=${err.status} type=${err.type ?? "?"} message=${err.message}`,
          "",
        );
      }
      if (err instanceof Anthropic.APIConnectionError) {
        return finalize("api_error", `APIConnectionError: ${err.message}`, "");
      }
      return finalize("api_error", `Unknown error: ${String(err)}`, "");
    }

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "max_tokens") {
      const text = extractText(response.content);
      return finalize("max_tokens", `Hit max_tokens at turn ${turns}`, text);
    }

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUses.length === 0) {
        return finalize("unexpected_stop_reason", "stop_reason=tool_use but no tool_use blocks", "");
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tu of toolUses) {
        const executor = registry[tu.name];
        if (!executor) {
          toolCalls.push({
            turn: turns,
            name: tu.name,
            input: asRecord(tu.input),
            result: `unknown tool: ${tu.name}`,
            errored: true,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: unknown tool "${tu.name}"`,
            is_error: true,
          });
          continue;
        }

        let result: string;
        let errored = false;
        try {
          result = executor(asRecord(tu.input));
        } catch (e) {
          errored = true;
          result = `Error: ${(e as Error).message}`;
        }

        toolCalls.push({
          turn: turns,
          name: tu.name,
          input: asRecord(tu.input),
          result,
          errored,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result,
          is_error: errored,
        });

        log(`[${scenario.id}#${iteration}] turn ${turns}: ${tu.name}(${truncate(JSON.stringify(tu.input), 120)}) → ${errored ? "ERR" : "ok"}`);
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    if (response.stop_reason === "end_turn") {
      const finalText = extractText(response.content);
      const verdict = classifyAgainstScenario(scenario, toolCalls, finalText, workspaceDir);
      return finalize(verdict.outcome, verdict.detail, finalText);
    }

    return finalize(
      "unexpected_stop_reason",
      `stop_reason=${response.stop_reason}`,
      extractText(response.content),
    );
  }

  return finalize(
    "max_iterations",
    `Did not finish within ${scenario.maxIterations} iterations`,
    "",
  );
}

function classifyAgainstScenario(
  scenario: Scenario,
  toolCalls: ToolCall[],
  finalText: string,
  workspaceDir: string,
): { outcome: RunOutcome; detail: string } {
  if (toolCalls.length === 0) {
    return { outcome: "text_instead_of_tool", detail: "Model finished without calling any tool" };
  }

  const expectedNames = scenario.expectedTools.map((e) => e.toolName);
  const actualNames = toolCalls.map((c) => c.name);

  for (const name of expectedNames) {
    if (!actualNames.includes(name)) {
      return {
        outcome: "missing_tool",
        detail: `Expected tool ${name} was never called. Actual: [${actualNames.join(", ") || "none"}]`,
      };
    }
  }

  for (const expectation of scenario.expectedTools) {
    const match = toolCalls.find((c) => c.name === expectation.toolName);
    if (!match) continue;
    if (expectation.inputContains) {
      for (const [key, needle] of Object.entries(expectation.inputContains)) {
        const got = match.input[key];
        const hay = typeof got === "string" ? got : JSON.stringify(got ?? "");
        if (!hay.includes(needle)) {
          return {
            outcome: "bad_input",
            detail: `Tool ${expectation.toolName}.${key} expected to contain ${JSON.stringify(needle)}; got ${JSON.stringify(hay)}`,
          };
        }
      }
    }
  }

  if (toolCalls.some((c) => c.errored)) {
    return {
      outcome: "tool_execution_failed",
      detail: "One or more tool calls errored (likely malformed args from the model)",
    };
  }

  if (scenario.expectedFinalTextContains) {
    for (const needle of scenario.expectedFinalTextContains) {
      if (!finalText.includes(needle)) {
        return {
          outcome: "missing_final_text",
          detail: `Final text missing required substring ${JSON.stringify(needle)}. Got: ${truncate(finalText, 200)}`,
        };
      }
    }
  }

  if (scenario.postCheck && !scenario.postCheck(workspaceDir)) {
    return { outcome: "post_check_failed", detail: "Filesystem post-check failed" };
  }

  return { outcome: "success", detail: "All checks passed" };
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

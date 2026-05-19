import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runScenarioOnce, type RunOutcome, type RunResult } from "./harness.js";
import { SCENARIOS } from "./scenarios.js";
import { makeRegistry } from "./tools.js";

interface Config {
  baseUrl: string;
  apiKey: string;
  model: string;
  iterationsPerScenario: number;
  requestTimeoutMs: number;
  workspaceRoot: string;
  dryRun: boolean;
  passThresholdPct: number;
  resultsPath: string | null;
}

const BASH_ALLOWLIST: ReadonlyArray<RegExp> = [
  /^ls(\s+-[a-zA-Z]+)?(\s+\S+)?$/,
  /^cat\s+\S+$/,
  /^echo\s+.+$/,
];

function loadConfig(): Config {
  const env = process.env;
  return {
    baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    apiKey: env.OLLAMA_AUTH_TOKEN ?? "ollama",
    model: env.POC_MODEL ?? "gemma4-agentic",
    iterationsPerScenario: parseInt(env.POC_ITERATIONS ?? "3", 10),
    requestTimeoutMs: parseInt(env.POC_TIMEOUT_MS ?? "600000", 10),
    workspaceRoot: env.POC_WORKSPACE_ROOT ?? join(tmpdir(), "nanoclaw-ollama-poc"),
    dryRun: env.DRY_RUN === "1",
    passThresholdPct: parseInt(env.POC_PASS_THRESHOLD_PCT ?? "70", 10),
    resultsPath: env.POC_RESULTS_PATH ?? null,
  };
}

function describeConfig(c: Config): string {
  return [
    `  baseURL          : ${c.baseUrl}`,
    `  model            : ${c.model}`,
    `  iterations/case  : ${c.iterationsPerScenario}`,
    `  request timeout  : ${c.requestTimeoutMs} ms`,
    `  workspace root   : ${c.workspaceRoot}`,
    `  pass threshold   : ${c.passThresholdPct}%`,
    `  dry-run mode     : ${c.dryRun ? "yes" : "no"}`,
  ].join("\n");
}

interface ScenarioStat {
  scenarioId: string;
  title: string;
  attempts: number;
  successes: number;
  outcomes: Partial<Record<RunOutcome, number>>;
  avgDurationMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

function summarize(results: RunResult[]): ScenarioStat[] {
  const byScenario = new Map<string, RunResult[]>();
  for (const r of results) {
    const list = byScenario.get(r.scenarioId) ?? [];
    list.push(r);
    byScenario.set(r.scenarioId, list);
  }

  const stats: ScenarioStat[] = [];
  for (const sc of SCENARIOS) {
    const runs = byScenario.get(sc.id) ?? [];
    if (runs.length === 0) continue;
    const outcomes: Partial<Record<RunOutcome, number>> = {};
    let successes = 0;
    let totalDuration = 0;
    let totalIn = 0;
    let totalOut = 0;
    for (const r of runs) {
      outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
      if (r.outcome === "success") successes++;
      totalDuration += r.durationMs;
      totalIn += r.inputTokens;
      totalOut += r.outputTokens;
    }
    stats.push({
      scenarioId: sc.id,
      title: sc.title,
      attempts: runs.length,
      successes,
      outcomes,
      avgDurationMs: Math.round(totalDuration / runs.length),
      avgInputTokens: Math.round(totalIn / runs.length),
      avgOutputTokens: Math.round(totalOut / runs.length),
    });
  }
  return stats;
}

function renderTable(stats: ScenarioStat[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("Scenario summary");
  lines.push("-".repeat(80));
  lines.push(
    "ID                    Success  Avg ms    In tok  Out tok  Outcomes",
  );
  lines.push("-".repeat(80));
  for (const s of stats) {
    const rate = `${s.successes}/${s.attempts}`;
    const outcomeStr = Object.entries(s.outcomes)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    lines.push(
      `${s.scenarioId.padEnd(22)}${rate.padEnd(9)}${String(s.avgDurationMs).padEnd(10)}${String(s.avgInputTokens).padEnd(8)}${String(s.avgOutputTokens).padEnd(9)}${outcomeStr}`,
    );
  }
  lines.push("-".repeat(80));
  return lines.join("\n");
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log("Ollama Gemma 4 PoC — quality gate");
  console.log(describeConfig(cfg));
  console.log("");

  if (cfg.dryRun) {
    console.log("DRY_RUN=1 — listing scenarios and exiting without calling Ollama.");
    for (const sc of SCENARIOS) {
      console.log(`  ${sc.id}  ${sc.title}`);
      console.log(`    expects tools: ${sc.expectedTools.map((e) => e.toolName).join(", ")}`);
      console.log(`    max iterations: ${sc.maxIterations}`);
    }
    return;
  }

  rmSync(cfg.workspaceRoot, { recursive: true, force: true });
  mkdirSync(cfg.workspaceRoot, { recursive: true });

  const client = new Anthropic({
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    maxRetries: 0,
  });

  const allResults: RunResult[] = [];

  for (const scenario of SCENARIOS) {
    const scenarioWorkspace = join(cfg.workspaceRoot, scenario.id);

    for (let i = 0; i < cfg.iterationsPerScenario; i++) {
      const iterationWorkspace = join(scenarioWorkspace, `iter-${i + 1}`);
      rmSync(iterationWorkspace, { recursive: true, force: true });
      mkdirSync(iterationWorkspace, { recursive: true });

      const registry = makeRegistry({
        workspaceDir: iterationWorkspace,
        bashAllowlist: BASH_ALLOWLIST,
      });

      process.stdout.write(`[${scenario.id} iter ${i + 1}/${cfg.iterationsPerScenario}] running... `);
      const result = await runScenarioOnce({
        client,
        model: cfg.model,
        scenario,
        workspaceDir: iterationWorkspace,
        registry,
        iteration: i + 1,
        requestTimeoutMs: cfg.requestTimeoutMs,
        logger: () => {},
      });
      console.log(`${result.outcome} (${result.durationMs} ms, ${result.turns} turns)`);
      allResults.push(result);
    }
  }

  const stats = summarize(allResults);
  console.log(renderTable(stats));

  const overallSuccess = allResults.filter((r) => r.outcome === "success").length;
  const overallTotal = allResults.length;
  const overallPct = overallTotal === 0 ? 0 : (overallSuccess * 100) / overallTotal;
  console.log("");
  console.log(`Overall: ${overallSuccess}/${overallTotal} (${overallPct.toFixed(1)}%)`);
  console.log(`Threshold: ${cfg.passThresholdPct}%`);

  if (cfg.resultsPath) {
    writeFileSync(
      cfg.resultsPath,
      JSON.stringify(
        {
          config: {
            baseUrl: cfg.baseUrl,
            model: cfg.model,
            iterationsPerScenario: cfg.iterationsPerScenario,
            passThresholdPct: cfg.passThresholdPct,
          },
          stats,
          results: allResults,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`Wrote detailed results to ${cfg.resultsPath}`);
  }

  if (overallPct < cfg.passThresholdPct) {
    console.log("Quality gate: FAIL");
    process.exit(1);
  }

  console.log("Quality gate: PASS");
}

main().catch((err) => {
  console.error("PoC runner crashed:", err);
  process.exit(2);
});

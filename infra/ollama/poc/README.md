# Gemma 4 PoC — Quality Gate

This is the **Sprint 0 quality gate** for the dual-LLM backend decision. It
exercises five agentic tool-use scenarios against a local Ollama serving
Gemma 4 via the Anthropic-compatible endpoint, and reports a per-scenario
success rate plus a pass/fail verdict.

The PoC is intentionally isolated from the rest of the monorepo: it has its
own `package.json` and is *not* a member of the root npm workspaces. It can
run on any host that has Ollama with the `gemma4-agentic` model available,
including the eventual production GPU server.

## When to run this

- **Sprint 0:** to decide whether to proceed with the dual-LLM plan or pivot.
- **Before every Gemma version bump:** as a regression test.
- **After Modelfile changes:** to verify tool-use behaviour didn't regress.

## What it does

For each scenario:
1. Spins up a fresh workspace directory under `POC_WORKSPACE_ROOT`.
2. Optionally seeds files the scenario needs.
3. Drives a multi-turn `client.messages.create()` loop, executing tools
   locally via a sandboxed registry.
4. Classifies the run with one of these outcomes:

   | Outcome | Meaning |
   |---|---|
   | `success` | All required tools called with valid input, final text matched expectations, post-checks passed |
   | `text_instead_of_tool` | Model returned `end_turn` without ever calling a tool — the primary Gemma failure mode |
   | `missing_tool` | At least one required tool was never called |
   | `wrong_tool` | An expected tool was replaced by a different one (reserved, currently classifier returns `missing_tool` instead) |
   | `bad_input` | Tool was called but a required argument didn't contain the expected substring |
   | `tool_execution_failed` | The local executor rejected the call (allowlist/sandbox violation or model produced invalid args) |
   | `missing_final_text` | Tools ran fine but the model's final reply omitted a required substring |
   | `post_check_failed` | Filesystem assertion after the run did not hold |
   | `max_iterations` | Model kept calling tools past the scenario's iteration cap |
   | `max_tokens` | Hit `max_tokens` during a turn |
   | `api_error` | Anthropic SDK threw — usually upstream Ollama issue |
   | `unexpected_stop_reason` | `pause_turn`, `refusal`, or `tool_use` with no blocks |

5. Aggregates across iterations (default 3 per scenario), prints a table,
   and exits with code `1` if the overall success rate is below the
   threshold.

## Scenarios

| ID | Tool(s) | What it tests |
|---|---|---|
| S1 | `read_file` | Single tool call, plain text quoting |
| S2 | `write_file` | Single tool call with two args, filesystem side effect verified |
| S3 | `bash` | Single tool call with allowlisted command, parsing output |
| S4 | `grep_search` → `read_file` | Tool chaining across two turns |
| S5 | `web_fetch` | Single tool call to a fixture URL (no real network) |

The bash tool uses a strict allowlist (`ls`, `cat`, `echo`) so a misbehaving
model cannot escape the workspace.

## Setup

Requires Ollama 0.21+ with the `gemma4-agentic` model already built. Follow
`docs/llm-dev-setup.md` first, then:

```sh
cd infra/ollama/poc
npm install
```

## Running

```sh
# Use defaults: localhost:11434, gemma4-agentic, 3 iterations per scenario
npm run run-poc

# Dry-run (lists scenarios, no Ollama call)
npm run dry-run

# Type check only
npm run typecheck

# Custom configuration
OLLAMA_BASE_URL=http://nanoclaw-ollama:11434 \
POC_MODEL=gemma4-agentic \
POC_ITERATIONS=5 \
POC_PASS_THRESHOLD_PCT=80 \
POC_RESULTS_PATH=./results-$(date +%s).json \
npm run run-poc
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Where the Anthropic-compatible API is served |
| `OLLAMA_AUTH_TOKEN` | `ollama` | Placeholder auth — Ollama doesn't validate |
| `POC_MODEL` | `gemma4-agentic` | Model tag inside Ollama |
| `POC_ITERATIONS` | `3` | Runs per scenario; raise for tighter confidence intervals |
| `POC_TIMEOUT_MS` | `600000` | Per-request timeout in ms (10 min default for CPU inference) |
| `POC_WORKSPACE_ROOT` | `$TMPDIR/nanoclaw-ollama-poc` | Where scenario sandboxes live |
| `POC_PASS_THRESHOLD_PCT` | `70` | Minimum overall success rate to flip the gate to PASS |
| `POC_RESULTS_PATH` | (unset) | If set, write the full run log as JSON for later analysis |
| `DRY_RUN` | (unset) | When `1`, list scenarios and exit |

## Judgment criteria

The threshold is **deliberately set at 70% overall success** for the
dual-LLM go/no-go decision. Rationale:

- The librarian research established that Gemma 4 26B MoE scores around
  85% on τ2-bench agentic tool use, vs. Claude Sonnet at 95%+.
- The PoC scenarios are simpler than τ2-bench (single tool or one chain),
  so we expect to land 75–90% if the model is honestly performing.
- Below 70% means the model fails one in three real requests, which would
  visibly degrade nanoclaw UX. That's a no-go signal.
- 70–85% means the model works but expect occasional retries — proceed with
  a fallback mechanism in mind.
- Above 85% means the dual-LLM plan is on solid ground.

Per-scenario, watch for:

- **S1, S5** (single tool, simple inputs): should be ≥ 90%. If lower, the
  Anthropic adapter itself is misbehaving — investigate Ollama version,
  Modelfile, and SDK compatibility before blaming the model.
- **S2** (filesystem side effect): should be ≥ 80%. Below = the model
  hallucinates the side effect instead of using the tool.
- **S3** (bash with allowlist): should be ≥ 80%. Watch for the model
  inventing bash flags that violate the allowlist.
- **S4** (tool chaining): the hardest scenario. ≥ 60% is acceptable; below
  means the model can't maintain context across turns.

Capture the full output to a file for the decision record:

```sh
npm run run-poc 2>&1 | tee gemma4-poc-$(date +%Y%m%d).log
```

After running, copy `RESULTS-TEMPLATE.md` to `RESULTS-<yyyy-mm-dd>.md` and
fill in the verdict — that's the artifact the Sprint 0 go/no-go decision
is recorded against.

## Limitations

- `web_fetch` does not make real network calls. It returns a fixture
  string for one whitelisted URL. This isolates the test from internet
  flakiness.
- `bash` runs only allowlisted commands and is bounded by a 10 s timeout
  + 1 MB stdout cap.
- All file operations are confined to a per-iteration workspace under
  `POC_WORKSPACE_ROOT`. The PoC will refuse paths outside that workspace.
- The classifier uses substring matching for tool inputs and final text,
  not strict JSON-schema validation. That's intentional — Gemma sometimes
  adds whitespace or trailing punctuation that strict matching would
  reject.

## Where this goes next

Once this gate passes on a real GPU host, the same harness can be wired
into the orchestrator's CI as a regression test on every dependency or
Modelfile bump. The `RunResult[]` JSON written to `POC_RESULTS_PATH` is
suitable for archival.

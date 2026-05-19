# Gemma 4 PoC Results

Copy this template to `RESULTS-<yyyy-mm-dd>.md` and fill in after running
`npm run run-poc` on a real Ollama host. The template is the authoritative
record for the Sprint 0 go/no-go decision.

## Environment

| Field | Value |
|---|---|
| Date | _yyyy-mm-dd_ |
| Run by | _name_ |
| Host | _e.g. Hetzner GEX130 / MacBook Pro M3 Max / RTX 4090 workstation_ |
| GPU | _e.g. L40S 48GB / Apple M3 Max 64GB unified / RTX 4090 24GB_ |
| Ollama version | _output of `ollama --version`_ |
| Base model tag | _e.g. gemma4:26b @ digest sha256:..._ |
| Agentic variant | _e.g. gemma4-agentic from infra/ollama/Modelfile.gemma4-agentic_ |
| SDK version | _from package.json or `npm ls @anthropic-ai/sdk`_ |
| Iterations / scenario | _e.g. 3_ |
| Pass threshold | _e.g. 70%_ |

## Overall verdict

- [ ] **PASS** — Overall success rate ≥ threshold. Dual-LLM plan proceeds.
- [ ] **WEAK PASS** — Overall in 70–85% range. Proceed with explicit
      fallback / retry logic in the proxy.
- [ ] **FAIL** — Overall < threshold. Re-evaluate before continuing
      Sprint 1.

## Aggregate numbers

Paste the final table from `npm run run-poc` output:

```
Scenario summary
--------------------------------------------------------------------------------
ID                    Success  Avg ms    In tok  Out tok  Outcomes
--------------------------------------------------------------------------------
S1-read-file          _/_      _         _       _        _
S2-write-file         _/_      _         _       _        _
S3-bash-ls            _/_      _         _       _        _
S4-grep-then-read     _/_      _         _       _        _
S5-web-fetch          _/_      _         _       _        _
--------------------------------------------------------------------------------

Overall: _/_  (__.__%)
```

JSON detail: `results-<yyyy-mm-dd>.json` (set `POC_RESULTS_PATH` when running).

## Per-scenario notes

For any scenario below threshold, capture:

- The most common failure outcome (e.g. `text_instead_of_tool` × 3)
- The tool calls the model made when it failed (from JSON results)
- A single representative failing turn quoted verbatim

### S1 read_file

| | |
|---|---|
| Rate | _/_ |
| Dominant failure (if any) | _outcome_ |
| Notes | _free text_ |

### S2 write_file

| | |
|---|---|
| Rate | _/_ |
| Dominant failure (if any) | _outcome_ |
| Notes | _free text_ |

### S3 bash

| | |
|---|---|
| Rate | _/_ |
| Dominant failure (if any) | _outcome_ |
| Notes | _free text_ |

### S4 grep_search → read_file

| | |
|---|---|
| Rate | _/_ |
| Dominant failure (if any) | _outcome_ |
| Notes | _free text — pay attention to whether the model loses context between turns_ |

### S5 web_fetch

| | |
|---|---|
| Rate | _/_ |
| Dominant failure (if any) | _outcome_ |
| Notes | _free text_ |

## Performance signal

| | |
|---|---|
| Avg latency (ms) across all calls | _e.g. 4200_ |
| Slowest scenario | _e.g. S4 due to chaining_ |
| GPU utilization during runs (from `nvidia-smi`) | _e.g. 65% steady_ |
| VRAM peak | _e.g. 22 GB of 48 GB on L40S_ |

## Decision

> _Write the call here. Continue with dual-LLM plan? Add a fallback?_
> _Increase iterations for tighter confidence? Re-tune Modelfile params?_
> _Pin a specific Ollama version because the latest regressed?_

Decided by: _name, date_

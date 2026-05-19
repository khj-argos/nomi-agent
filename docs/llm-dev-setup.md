# LLM Dev Setup — Ollama + Gemma 4

This guide gets a local Gemma 4 backend running so the agent container can talk
to it via `ANTHROPIC_BASE_URL=http://<ollama-host>:11434`.

Two installation paths are supported:

| Environment | Path | Why |
|---|---|---|
| macOS (Apple Silicon) | **Native** via `brew install ollama` | Docker on macOS can't pass through Metal; native is ~5–6× faster |
| Linux + NVIDIA GPU | **Docker Compose** at `infra/ollama/` | Reproducible, isolates model weights, prod-shape |
| Linux CPU-only | Either (Docker easier) | CPU inference at 26B is too slow for interactive agent work; use a smaller model (`gemma4:e4b`) for plumbing tests only |

The target model is **`gemma4:26b`** (Gemma 4 26B MoE Q4_K_M, ~18 GB on disk).
The Modelfile builds a customized variant `gemma4-agentic` with a 65 536-token
context window required by the Claude Code SDK for agentic workloads.

## Hardware requirements (Linux)

| GPU VRAM | 26B MoE at 64K ctx | Notes |
|---|---|---|
| < 24 GB | Won't fit | Use `gemma4:e4b` for plumbing tests |
| 24 GB | Fits with q8_0 KV cache + flash attention | RTX 4090 / L4 |
| 48 GB | Comfortable, room for 4–6 parallel slots | L40S — production target |

## Path A — macOS (native Ollama)

```sh
brew install ollama
brew services start ollama

infra/ollama/setup-native.sh
```

The script pulls `gemma4:26b` (one-time, ~18 GB download) and creates the
`gemma4-agentic` variant from `infra/ollama/Modelfile.gemma4-agentic`.

Point the agent container at the host's Ollama:

```
ANTHROPIC_BASE_URL=http://host.docker.internal:11434
ANTHROPIC_AUTH_TOKEN=ollama
```

> macOS hosts: pulling the 26B model with only ~16 GB unified memory will run
> but inference will swap heavily. For day-to-day dev on Apple Silicon, use
> `GEMMA_MODEL_TAG=gemma4:e4b setup-native.sh` and only rebuild with the 26B
> tag when validating real agent behavior.

## Path B — Linux + NVIDIA GPU (Docker Compose)

Prerequisites (one-time, on the host):

```sh
sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

The compose file expects to join the same Docker network the main
`docker-compose.yml` creates (`nanoclaw_nanoclaw`). Bring the main stack up
first so the network exists:

```sh
docker compose up -d
```

Then start Ollama (the container will pull and build the model on first run —
this can take 10–30 minutes depending on bandwidth):

```sh
docker compose -f infra/ollama/docker-compose.yml up -d
docker compose -f infra/ollama/docker-compose.yml logs -f ollama
```

The healthcheck only flips to `healthy` once `gemma4-agentic` exists in
`ollama list`. From other containers on the `nanoclaw_nanoclaw` network:

```
ANTHROPIC_BASE_URL=http://nanoclaw-ollama:11434
ANTHROPIC_AUTH_TOKEN=ollama
```

## Verifying it works

After setup, send a smoke-test request to the Anthropic-compatible endpoint:

```sh
curl http://localhost:11434/v1/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: ollama' \
  -H 'anthropic-version: 2023-06-01' \
  -d '{
    "model": "gemma4-agentic",
    "max_tokens": 64,
    "messages": [{"role": "user", "content": "Reply with the single word: ready"}]
  }'
```

A successful response is a JSON object with `content[0].text` containing the
model's reply. If you get `404 model not found`, the variant build hasn't
finished yet — re-run `setup-native.sh` (macOS) or check
`docker compose logs ollama` (Linux).

## Configuration knobs

All knobs are environment variables. Defaults are tuned for the production
target (L40S 48GB, 4 parallel slots, 64K context).

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_VERSION` | `latest` | Pin to a specific Ollama Docker tag (e.g. `0.21.0`) |
| `OLLAMA_HOST_PORT` | `11434` | Host-side port mapping |
| `OLLAMA_NUM_PARALLEL` | `4` | Concurrent inference slots — each takes ~3–6 GB extra VRAM at 64K ctx |
| `OLLAMA_FLASH_ATTENTION` | `1` | Required for stable 64K context — do not disable |
| `OLLAMA_KV_CACHE_TYPE` | `q8_0` | Halves KV-cache memory vs default `f16` |
| `OLLAMA_KEEP_ALIVE` | `-1` | Keep model resident in VRAM forever (prod default) |
| `GEMMA_MODEL_TAG` | `gemma4:26b` | Base model tag from ollama.com/library |
| `GEMMA_AGENTIC_NAME` | `gemma4-agentic` | Local name for the Modelfile-customized variant |

## Troubleshooting

**`ollama: command not found` (macOS):** Install with `brew install ollama`,
then `brew services start ollama` (the daemon must be running before the
setup script).

**`Error: failed to connect to ollama` (script):** The daemon isn't listening
on `localhost:11434`. On Linux, `systemctl --user status ollama` or run
`ollama serve` manually in another terminal.

**`pull manifest unauthorized` for `gemma4:26b`:** Ollama 0.21+ is required.
Check with `ollama --version`. Upgrade via `brew upgrade ollama` or
`curl -fsSL https://ollama.com/install.sh | sh`.

**Healthcheck never goes healthy (Docker):** First-run pulls 18 GB; the
`start_period: 600s` gives 10 minutes. Slow connections need longer — watch
`docker logs nanoclaw-ollama` and wait for `gemma4-agentic ready`.

**`out of memory` on inference:** The KV cache for 4 parallel slots × 64K ctx
exceeds available VRAM. Drop `OLLAMA_NUM_PARALLEL` to `2`, or use a smaller
context window in the Modelfile, or use a larger GPU.

**Inference is unexpectedly slow on Linux:** Confirm GPU usage with
`docker exec nanoclaw-ollama ollama ps` — the `PROCESSOR` column must show
`100% GPU`. If it shows partial CPU, the model was loaded with insufficient
VRAM headroom; check `nvidia-smi` during inference.

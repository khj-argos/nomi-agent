#!/bin/sh
set -eu

BASE_MODEL="${GEMMA_MODEL_TAG:-gemma4:26b}"
AGENTIC_MODEL="${GEMMA_AGENTIC_NAME:-gemma4-agentic}"
MODELFILE_PATH="$(cd "$(dirname "$0")" && pwd)/Modelfile.gemma4-agentic"

if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama CLI not found. Install:" >&2
  echo "  macOS:        brew install ollama && brew services start ollama" >&2
  echo "  Linux:        curl -fsSL https://ollama.com/install.sh | sh" >&2
  exit 1
fi

if ! ollama list >/dev/null 2>&1; then
  echo "ollama daemon is not reachable on \${OLLAMA_HOST:-http://localhost:11434}." >&2
  echo "Start it with:" >&2
  echo "  macOS:        brew services start ollama" >&2
  echo "  Linux:        systemctl --user start ollama   (or run 'ollama serve' manually)" >&2
  exit 1
fi

if ollama list | awk 'NR>1 {print $1}' | grep -qx "${AGENTIC_MODEL}:latest"; then
  echo "agentic model ${AGENTIC_MODEL} already present"
else
  echo "pulling base model ${BASE_MODEL}..."
  ollama pull "${BASE_MODEL}"

  echo "creating agentic variant ${AGENTIC_MODEL}..."
  ollama create "${AGENTIC_MODEL}" -f "${MODELFILE_PATH}"
fi

ollama list

cat <<EOF

Test the Anthropic-compatible endpoint:

  curl http://localhost:11434/v1/messages \\
    -H 'Content-Type: application/json' \\
    -H 'x-api-key: ollama' \\
    -H 'anthropic-version: 2023-06-01' \\
    -d '{
      "model": "${AGENTIC_MODEL}",
      "max_tokens": 256,
      "messages": [{"role": "user", "content": "Reply with the single word: ready"}]
    }'
EOF

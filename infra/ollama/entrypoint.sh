#!/bin/sh
set -eu

BASE_MODEL="${GEMMA_MODEL_TAG:-gemma4:26b}"
AGENTIC_MODEL="${GEMMA_AGENTIC_NAME:-gemma4-agentic}"
MODELFILE_PATH="/etc/ollama/Modelfile.gemma4-agentic"

ollama serve &
OLLAMA_PID=$!

trap 'kill -TERM "$OLLAMA_PID" 2>/dev/null; wait "$OLLAMA_PID"' INT TERM

echo "[entrypoint] waiting for ollama daemon..."
until ollama list >/dev/null 2>&1; do
  if ! kill -0 "$OLLAMA_PID" 2>/dev/null; then
    echo "[entrypoint] ollama daemon exited before becoming ready" >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] ollama daemon ready"

if ollama list | awk 'NR>1 {print $1}' | grep -qx "${AGENTIC_MODEL}:latest"; then
  echo "[entrypoint] agentic model ${AGENTIC_MODEL} already present, skipping create"
else
  echo "[entrypoint] pulling base model ${BASE_MODEL} (this may take a while on first run)..."
  ollama pull "${BASE_MODEL}"

  echo "[entrypoint] creating agentic variant ${AGENTIC_MODEL} from ${MODELFILE_PATH}..."
  ollama create "${AGENTIC_MODEL}" -f "${MODELFILE_PATH}"
  echo "[entrypoint] ${AGENTIC_MODEL} ready"
fi

ollama list

wait "$OLLAMA_PID"

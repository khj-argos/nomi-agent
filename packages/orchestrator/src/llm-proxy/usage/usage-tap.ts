import { Transform, TransformCallback } from 'node:stream';

export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
}

export interface UsageTap {
  transform: Transform;
  snapshot(): UsageSnapshot;
}

export function createStreamingUsageTap(): UsageTap {
  let inputTokens = 0;
  let outputTokens = 0;
  let model: string | null = null;
  let sseBuffer = '';

  const transform = new Transform({
    transform(chunk: Buffer, _encoding, cb: TransformCallback) {
      try {
        sseBuffer += chunk.toString('utf8');
        const events = extractCompleteSseEvents(sseBuffer);
        sseBuffer = events.remainder;
        for (const evt of events.events) {
          const parsed = parseEvent(evt);
          if (!parsed) continue;
          if (parsed.type === 'message_start') {
            const msg = (parsed as { message?: { model?: string; usage?: { input_tokens?: number } } }).message;
            if (msg?.model && model === null) model = msg.model;
            if (typeof msg?.usage?.input_tokens === 'number') {
              inputTokens = msg.usage.input_tokens;
            }
          } else if (parsed.type === 'message_delta') {
            const usage = (parsed as { usage?: { output_tokens?: number } }).usage;
            if (typeof usage?.output_tokens === 'number') {
              outputTokens = usage.output_tokens;
            }
          }
        }
      } catch {
        // Parsing failures must never break the byte stream.
      }
      cb(null, chunk);
    },
  });

  return {
    transform,
    snapshot: () => ({ inputTokens, outputTokens, model }),
  };
}

export function createNonStreamingUsageTap(): UsageTap {
  let inputTokens = 0;
  let outputTokens = 0;
  let model: string | null = null;
  let body = '';

  const transform = new Transform({
    transform(chunk: Buffer, _encoding, cb: TransformCallback) {
      body += chunk.toString('utf8');
      cb(null, chunk);
    },
    flush(cb) {
      try {
        const parsed = JSON.parse(body) as {
          model?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        if (parsed.model) model = parsed.model;
        if (typeof parsed.usage?.input_tokens === 'number') {
          inputTokens = parsed.usage.input_tokens;
        }
        if (typeof parsed.usage?.output_tokens === 'number') {
          outputTokens = parsed.usage.output_tokens;
        }
      } catch {
        // Body wasn't JSON (e.g. error page) — leave counters at zero.
      }
      cb(null);
    },
  });

  return {
    transform,
    snapshot: () => ({ inputTokens, outputTokens, model }),
  };
}

function extractCompleteSseEvents(buffer: string): { events: string[]; remainder: string } {
  const events: string[] = [];
  let start = 0;
  while (true) {
    const sep = buffer.indexOf('\n\n', start);
    if (sep < 0) break;
    events.push(buffer.slice(start, sep));
    start = sep + 2;
  }
  return { events, remainder: buffer.slice(start) };
}

function parseEvent(raw: string): { type: string } | null {
  let dataLine: string | null = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      dataLine = line.slice(6);
      break;
    }
  }
  if (!dataLine) return null;
  try {
    const parsed = JSON.parse(dataLine) as { type?: string };
    if (typeof parsed.type === 'string') return parsed as { type: string };
    return null;
  } catch {
    return null;
  }
}

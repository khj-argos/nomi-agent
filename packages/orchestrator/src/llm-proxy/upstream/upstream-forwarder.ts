import { Logger } from '@nestjs/common';
import { Readable, Transform } from 'node:stream';
import { ForwardContext, ForwardResult } from './forwarder.types';

const PASSTHROUGH_RESPONSE_HEADERS = new Set([
  'content-type',
  'cache-control',
  'request-id',
  'anthropic-version',
  'anthropic-request-id',
  'retry-after',
]);

export async function forwardToUpstream(opts: {
  ctx: ForwardContext;
  upstreamUrl: string;
  upstreamHeaders: Record<string, string>;
  logger: Logger;
  label: string;
}): Promise<ForwardResult> {
  const { ctx, upstreamUrl, upstreamHeaders, logger, label } = opts;
  const { req, res, body, isStreaming, timeoutMs } = ctx;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs).unref();

  const onClientDisconnect = () => {
    if (!controller.signal.aborted) {
      logger.warn(`[${label}] client disconnected — aborting upstream request`);
      controller.abort();
    }
  };
  req.once('close', onClientDisconnect);

  const cleanup = () => {
    clearTimeout(timeoutHandle);
    req.off('close', onClientDisconnect);
  };

  const upstreamStart = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    cleanup();
    if (controller.signal.aborted) {
      throw new UpstreamAbortedError(`Upstream request to ${label} was aborted`);
    }
    throw new UpstreamConnectionError(
      `Failed to reach ${label} at ${upstreamUrl}: ${(err as Error).message}`,
    );
  }

  for (const [name, value] of upstream.headers.entries()) {
    if (PASSTHROUGH_RESPONSE_HEADERS.has(name.toLowerCase())) {
      res.setHeader(name, value);
    }
  }
  if (isStreaming) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  res.status(upstream.status);

  if (!upstream.body) {
    cleanup();
    res.end();
    return {
      status: upstream.status,
      upstreamDurationMs: Date.now() - upstreamStart,
      bytesForwarded: 0,
    };
  }

  const transformer = ctx.responseTap ?? null;
  const sourceStream = Readable.fromWeb(
    upstream.body as unknown as ReadableStream<Uint8Array>,
  );

  let bytes = 0;
  const byteCounter = new Transform({
    transform(chunk, _encoding, cb) {
      bytes += (chunk as Buffer).length;
      cb(null, chunk);
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      let stream: NodeJS.ReadableStream = sourceStream;
      if (transformer) stream = stream.pipe(transformer);
      stream = stream.pipe(byteCounter);

      stream.on('error', reject);
      res.on('error', reject);
      stream.on('end', () => resolve());
      stream.pipe(res, { end: true });
    });
  } finally {
    cleanup();
  }

  return {
    status: upstream.status,
    upstreamDurationMs: Date.now() - upstreamStart,
    bytesForwarded: bytes,
  };
}

export class UpstreamAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamAbortedError';
  }
}

export class UpstreamConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamConnectionError';
  }
}

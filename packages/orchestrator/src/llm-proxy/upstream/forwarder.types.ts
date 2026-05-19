import { Request, Response } from 'express';
import { Transform } from 'node:stream';

export interface ForwardContext {
  req: Request;
  res: Response;
  body: unknown;
  isStreaming: boolean;
  timeoutMs: number;
  requestStart: number;
  responseTap?: Transform;
}

export interface ForwardResult {
  status: number;
  upstreamDurationMs: number;
  bytesForwarded: number;
}

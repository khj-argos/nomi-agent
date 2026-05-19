import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { BudgetService } from './budget/budget.service';
import { LlmExceptionFilter } from './errors/llm-exception.filter';
import { InternalCaller } from './internal-token/internal-token.decorator';
import { InternalTokenGuard, InternalTokenContext } from './guards/internal-token.guard';
import { RoutingService } from './routing/routing.service';
import { OllamaForwarderService } from './upstream/ollama-forwarder.service';
import { AnthropicForwarderService } from './upstream/anthropic-forwarder.service';
import { ForwardContext } from './upstream/forwarder.types';
import {
  UpstreamAbortedError,
  UpstreamConnectionError,
} from './upstream/upstream-forwarder';
import {
  createNonStreamingUsageTap,
  createStreamingUsageTap,
} from './usage/usage-tap';
import { UsageRecorderService } from './usage/usage-recorder.service';

interface MessagesRequestBody {
  model?: string;
  stream?: boolean;
  [key: string]: unknown;
}

@Controller('llm/v1')
@UseGuards(InternalTokenGuard)
@UseFilters(LlmExceptionFilter)
export class LlmProxyController {
  private readonly logger = new Logger(LlmProxyController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly routing: RoutingService,
    private readonly ollama: OllamaForwarderService,
    private readonly anthropic: AnthropicForwarderService,
    private readonly usage: UsageRecorderService,
    private readonly budget: BudgetService,
  ) {}

  @Post('messages')
  async messages(
    @InternalCaller() caller: InternalTokenContext,
    @Body() body: MessagesRequestBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const requestStart = Date.now();
    const decision = await this.routing.resolve(caller.userId, caller.instanceId);

    if (decision.backend === 'ollama') {
      const snapshot = await this.budget.snapshot(caller.userId);
      if (!snapshot.withinBudget) {
        throw new HttpException(
          {
            type: 'error',
            error: {
              type: 'rate_limit_error',
              message: `Daily free-tier token limit reached (${snapshot.used}/${snapshot.limit}). Configure a Claude API key in settings to continue.`,
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (!body.model || body.model.length === 0) {
        body.model = decision.defaultModel;
      }
    }

    const isStreaming = body.stream === true;
    const timeoutMs = this.config.getOrThrow<number>('llmProxy.requestTimeoutMs');
    const tap = isStreaming ? createStreamingUsageTap() : createNonStreamingUsageTap();

    const ctx: ForwardContext = {
      req,
      res,
      body,
      isStreaming,
      timeoutMs,
      requestStart,
      responseTap: tap.transform,
    };

    try {
      const result = decision.backend === 'ollama'
        ? await this.ollama.forward(ctx, decision)
        : await this.anthropic.forward(ctx, decision);

      const snapshot = tap.snapshot();
      void this.usage.record({
        userId: caller.userId,
        instanceId: caller.instanceId,
        backend: decision.backend,
        status: result.status,
        totalDurationMs: Date.now() - requestStart,
        upstreamDurationMs: result.upstreamDurationMs,
        ...snapshot,
      });

      this.logger.debug(
        `llm forwarded user=${caller.userId} backend=${decision.backend} status=${result.status} bytes=${result.bytesForwarded} upstream=${result.upstreamDurationMs}ms total=${Date.now() - requestStart}ms in=${snapshot.inputTokens} out=${snapshot.outputTokens}`,
      );
    } catch (err) {
      if (err instanceof UpstreamAbortedError) {
        if (!res.headersSent) {
          res.status(HttpStatus.GATEWAY_TIMEOUT).end();
        } else {
          res.end();
        }
        return;
      }
      if (err instanceof UpstreamConnectionError) {
        this.logger.error(err.message);
        if (!res.headersSent) {
          throw new HttpException(
            { type: 'error', error: { type: 'api_error', message: 'Upstream LLM unavailable' } },
            HttpStatus.BAD_GATEWAY,
          );
        }
        res.end();
        return;
      }
      throw err;
    }
  }
}

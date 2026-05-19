import { Injectable, Logger } from '@nestjs/common';
import { ForwardContext, ForwardResult } from './forwarder.types';
import { RoutingDecisionAnthropic } from '../routing/routing.types';
import { forwardToUpstream } from './upstream-forwarder';

@Injectable()
export class AnthropicForwarderService {
  private readonly logger = new Logger(AnthropicForwarderService.name);

  forward(
    ctx: ForwardContext,
    decision: RoutingDecisionAnthropic,
  ): Promise<ForwardResult> {
    const url = `${trimTrailingSlash(decision.baseUrl)}/v1/messages`;
    const upstreamHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': decision.apiKey,
      'anthropic-version': pickAnthropicVersion(ctx.req.headers['anthropic-version']),
    };
    const beta = ctx.req.headers['anthropic-beta'];
    if (typeof beta === 'string') upstreamHeaders['anthropic-beta'] = beta;

    return forwardToUpstream({
      ctx,
      upstreamUrl: url,
      upstreamHeaders,
      logger: this.logger,
      label: 'anthropic',
    });
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function pickAnthropicVersion(header: string | string[] | undefined): string {
  if (typeof header === 'string' && header.length > 0) return header;
  return '2023-06-01';
}

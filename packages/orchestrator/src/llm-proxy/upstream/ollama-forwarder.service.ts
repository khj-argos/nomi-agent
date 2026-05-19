import { Injectable, Logger } from '@nestjs/common';
import { ForwardContext, ForwardResult } from './forwarder.types';
import { RoutingDecisionOllama } from '../routing/routing.types';
import { forwardToUpstream } from './upstream-forwarder';

@Injectable()
export class OllamaForwarderService {
  private readonly logger = new Logger(OllamaForwarderService.name);

  forward(
    ctx: ForwardContext,
    decision: RoutingDecisionOllama,
  ): Promise<ForwardResult> {
    const url = `${trimTrailingSlash(decision.baseUrl)}/v1/messages`;
    return forwardToUpstream({
      ctx,
      upstreamUrl: url,
      upstreamHeaders: {
        'content-type': 'application/json',
        'x-api-key': 'ollama',
        'anthropic-version': '2023-06-01',
      },
      logger: this.logger,
      label: 'ollama',
    });
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

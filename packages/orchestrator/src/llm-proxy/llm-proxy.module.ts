import { Module } from '@nestjs/common';
import { BudgetService } from './budget/budget.service';
import { InternalTokenGuard } from './guards/internal-token.guard';
import { InternalTokenService } from './internal-token/internal-token.service';
import { LlmProxyController } from './llm-proxy.controller';
import { RoutingService } from './routing/routing.service';
import { AnthropicForwarderService } from './upstream/anthropic-forwarder.service';
import { OllamaForwarderService } from './upstream/ollama-forwarder.service';
import { UsageRecorderService } from './usage/usage-recorder.service';

@Module({
  controllers: [LlmProxyController],
  providers: [
    InternalTokenService,
    InternalTokenGuard,
    RoutingService,
    OllamaForwarderService,
    AnthropicForwarderService,
    UsageRecorderService,
    BudgetService,
  ],
  exports: [InternalTokenService, InternalTokenGuard, BudgetService],
})
export class LLMProxyModule {}

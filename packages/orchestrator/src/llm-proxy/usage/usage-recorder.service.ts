import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RoutingBackend } from '../routing/routing.types';
import { UsageSnapshot } from './usage-tap';

export interface UsageRecord extends UsageSnapshot {
  userId: string;
  instanceId: string;
  backend: RoutingBackend;
  status: number;
  totalDurationMs: number;
  upstreamDurationMs: number;
}

@Injectable()
export class UsageRecorderService {
  private readonly logger = new Logger(UsageRecorderService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async record(record: UsageRecord): Promise<void> {
    const { error } = await this.supabase.db.from('usage_logs').insert({
      user_id: record.userId,
      action: 'llm_request',
      model: record.model,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      backend: record.backend,
      metadata: {
        instance_id: record.instanceId,
        status: record.status,
        total_duration_ms: record.totalDurationMs,
        upstream_duration_ms: record.upstreamDurationMs,
      },
    });

    if (error) {
      this.logger.warn(
        `Failed to record llm usage user=${record.userId} backend=${record.backend}: ${error.message}`,
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/supabase/supabase.service';

export interface BudgetSnapshot {
  used: number;
  limit: number;
  remaining: number;
  withinBudget: boolean;
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async snapshot(userId: string): Promise<BudgetSnapshot> {
    const limit = this.config.getOrThrow<number>('llmProxy.freeTierDailyTokenLimit');
    const since = startOfTodayIso();

    const { data, error } = await this.supabase.db
      .from('usage_logs')
      .select('input_tokens, output_tokens')
      .eq('user_id', userId)
      .eq('action', 'llm_request')
      .gte('created_at', since);

    if (error) {
      this.logger.warn(`Budget snapshot query failed for ${userId}: ${error.message}`);
      return { used: 0, limit, remaining: limit, withinBudget: true };
    }

    let used = 0;
    for (const row of data ?? []) {
      used += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    }
    const remaining = Math.max(0, limit - used);
    return { used, limit, remaining, withinBudget: used < limit };
  }
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

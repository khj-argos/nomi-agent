import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt } from '../../common/crypto/encrypt';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RoutingDecision } from './routing.types';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async resolve(userId: string, instanceId: string): Promise<RoutingDecision> {
    const { data: instance, error } = await this.supabase.db
      .from('instances')
      .select('active_llm')
      .eq('id', instanceId)
      .eq('user_id', userId)
      .single();

    if (error || !instance) {
      throw new NotFoundException(
        `Instance ${instanceId} not found for user ${userId}`,
      );
    }

    if (instance.active_llm === 'anthropic_byok') {
      const apiKey = await this.loadAnthropicKey(userId);
      if (apiKey) {
        return {
          backend: 'anthropic',
          baseUrl: this.config.getOrThrow<string>('llmProxy.anthropicApiUrl'),
          apiKey,
        };
      }
      this.logger.warn(
        `Instance ${instanceId} prefers anthropic_byok but no decryptable key — falling back to gemma_hosted`,
      );
    }

    return {
      backend: 'ollama',
      baseUrl: this.config.getOrThrow<string>('llmProxy.ollamaBaseUrl'),
      defaultModel: this.config.getOrThrow<string>('llmProxy.ollamaDefaultModel'),
    };
  }

  private async loadAnthropicKey(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase.db
      .from('user_api_keys')
      .select('anthropic_key, key_iv, key_tag, is_verified')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data?.anthropic_key) return null;

    try {
      const aesKey = this.config.getOrThrow<string>('aesSecretKey');
      return decrypt(
        { encrypted: data.anthropic_key, iv: data.key_iv, tag: data.key_tag },
        aesKey,
      );
    } catch (err) {
      this.logger.error(
        `Failed to decrypt anthropic key for user ${userId}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}

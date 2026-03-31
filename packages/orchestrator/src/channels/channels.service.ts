import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WebClient } from '@slack/web-api';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ConnectSlackDto } from './dto/connect-slack.dto';
import { ConnectTelegramDto } from './dto/connect-telegram.dto';
import { encrypt, sha256 } from '../common/crypto/encrypt';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async connectSlack(userId: string, dto: ConnectSlackDto) {
    const { data: instance } = await this.supabase.db
      .from('instances')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!instance) {
      throw new BadRequestException('Instance not found. Create an instance first.');
    }

    const { data: existing } = await this.supabase.db
      .from('channels')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'slack')
      .single();

    if (existing) {
      await this.supabase.db
        .from('channels')
        .update({
          identifier: dto.teamId,
          display_name: dto.teamName,
          is_active: true,
          connected_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      return { success: true, message: 'Slack channel updated' };
    }

    await this.supabase.db.from('channels').insert({
      user_id: userId,
      instance_id: instance.id,
      type: 'slack',
      identifier: dto.teamId,
      display_name: dto.teamName,
      is_active: true,
      connected_at: new Date().toISOString(),
    });

    await this.supabase.db.from('instance_events').insert({
      instance_id: instance.id,
      user_id: userId,
      event_type: 'channel_connected',
      metadata: { channel: 'slack', team_id: dto.teamId },
    });

    await this.sendWelcomeMessage(dto.channelId);

    this.logger.log(`Slack connected for user ${userId}, team ${dto.teamId}`);
    return { success: true, message: 'Slack channel connected' };
  }

  async connectTelegram(userId: string, dto: ConnectTelegramDto) {
    const { data: instance } = await this.supabase.db
      .from('instances')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!instance) {
      throw new BadRequestException('Instance not found. Create an instance first.');
    }

    const aesKey = this.config.getOrThrow<string>('aesSecretKey');
    const { encrypted, iv, tag } = encrypt(dto.botToken, aesKey);
    const tokenHash = sha256(dto.botToken);

    await this.supabase.db
      .from('channels')
      .upsert({
        user_id: userId,
        instance_id: instance.id,
        type: 'telegram',
        identifier: tokenHash,
        display_name: dto.botUsername,
        metadata_encrypted: JSON.stringify({ encrypted, iv, tag }),
        is_active: true,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id,type' });

    await this.supabase.db.from('instance_events').insert({
      instance_id: instance.id,
      user_id: userId,
      event_type: 'channel_connected',
      metadata: { channel: 'telegram', bot_username: dto.botUsername },
    });

    const webhookBaseUrl = this.config.get<string>('webhookBaseUrl') ?? 'http://localhost:4001';
    const webhookUrl = `${webhookBaseUrl}/api/v1/webhooks/telegram/${dto.botToken}`;
    await fetch(`https://api.telegram.org/bot${dto.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    }).catch(err => this.logger.warn(`Telegram setWebhook failed: ${err}`));

    this.logger.log(`Telegram connected for user ${userId}, bot @${dto.botUsername}`);
    return { success: true, message: 'Telegram channel connected' };
  }

  async listChannels(userId: string) {
    const { data } = await this.supabase.db
      .from('channels')
      .select('id, type, display_name, is_active, connected_at, last_message_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return data ?? [];
  }

  async disconnectChannel(userId: string, channelId: string) {
    await this.supabase.db
      .from('channels')
      .update({ is_active: false })
      .eq('id', channelId)
      .eq('user_id', userId);

    return { success: true };
  }

  private async sendWelcomeMessage(channelId: string) {
    const botToken = this.config.get<string>('slack.botToken');
    if (!botToken) return;

    const web = new WebClient(botToken);
    await web.chat.postMessage({
      channel: channelId,
      text: '안녕하세요! 저 Nomi예요 👋 지금부터 열심히 도와드릴게요 😊',
    }).catch(err => this.logger.warn(`Welcome message failed: ${err}`));
  }
}

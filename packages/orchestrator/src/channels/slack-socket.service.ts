import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { SupabaseService } from '../common/supabase/supabase.service';
import { MessageDispatchService } from '../containers/message-dispatch.service';

@Injectable()
export class SlackSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlackSocketService.name);
  private client: SocketModeClient | null = null;
  private webClient: WebClient | null = null;
  private readonly processedEvents = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly messageDispatch: MessageDispatchService,
  ) {}

  async onModuleInit() {
    const appToken = this.config.get<string>('slack.appToken');
    const botToken = this.config.get<string>('slack.botToken');

    if (!appToken || !botToken) {
      this.logger.warn('SLACK_APP_TOKEN or SLACK_BOT_TOKEN not set — Slack disabled');
      return;
    }

    this.webClient = new WebClient(botToken);
    this.client = new SocketModeClient({ appToken, logLevel: 'warn' as any });

    this.client.on('message', async ({ event, ack }: any) => {
      await ack();
      await this.handleMessage(event).catch(err =>
        this.logger.error(`Message handler error: ${err}`),
      );
    });

    this.client.on('app_mention', async ({ event, ack }: any) => {
      await ack();
      await this.handleMessage(event).catch(err =>
        this.logger.error(`Mention handler error: ${err}`),
      );
    });

    await this.client.start();
    this.logger.log('Slack Socket Mode connected ✅');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.logger.log('Slack Socket Mode disconnected');
    }
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    if (!this.webClient) return;
    await this.webClient.chat.postMessage({ channel: channelId, text });
  }

  private async handleMessage(event: Record<string, unknown>) {
    if (event.bot_id || event.subtype) return;

    const eventId = `${event.client_msg_id ?? event.ts ?? ''}`;
    if (eventId && this.processedEvents.has(eventId)) return;
    if (eventId) {
      this.processedEvents.add(eventId);
      setTimeout(() => this.processedEvents.delete(eventId), 60_000);
    }

    const channelId = event.channel as string;
    const teamId = event.team as string;
    const text = event.text as string;

    if (!channelId || !teamId || !text?.trim()) return;

    const { data: channel } = await this.supabase.db
      .from('channels')
      .select('user_id, instance_id, instances(container_id)')
      .eq('type', 'slack')
      .eq('identifier', teamId)
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!channel) {
      this.logger.debug(`No channel registered for Slack team: ${teamId}`);
      return;
    }

    await this.supabase.db.from('usage_logs').insert({
      user_id: channel.user_id,
      action: 'message_received',
      metadata: { channel: 'slack', channel_id: channelId },
    });

    await this.supabase.db
      .from('instances')
      .update({ last_activity: new Date().toISOString() })
      .eq('user_id', channel.user_id);

    await this.supabase.db
      .from('channels')
      .update({ last_message_at: new Date().toISOString() })
      .eq('instance_id', channel.instance_id)
      .eq('type', 'slack');

    this.logger.log(`Dispatching Slack message for user ${channel.user_id} in channel ${channelId}`);

    await this.messageDispatch.dispatch(
      channel.user_id,
      text,
      `slack:${channelId}`,
      async (reply: string) => {
        await this.sendMessage(channelId, reply);
      },
    );
  }
}

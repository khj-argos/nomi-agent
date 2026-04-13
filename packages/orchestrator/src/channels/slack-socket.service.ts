import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ContainerManagerService } from '../containers/container-manager.service';
import { InstancesService } from '../instances/instances.service';

@Injectable()
export class SlackSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlackSocketService.name);
  private client: SocketModeClient | null = null;
  private webClient: WebClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly containerManager: ContainerManagerService,
    private readonly instancesService: InstancesService,
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
      .single();

    if (!channel) {
      this.logger.debug(`No channel registered for Slack team: ${teamId}`);
      return;
    }

    await this.supabase.db.from('usage_logs').insert({
      user_id: channel.user_id,
      action: 'message_received',
      metadata: { channel: 'slack', channel_id: channelId },
    });

    const instance = channel.instances as unknown as Record<string, unknown>;
    const containerId = instance?.container_id as string | null;

    if (!containerId) {
      await this.sendMessage(channelId, '잠깐만요, 준비 중이에요 🔄');
      const newContainerId = await this.containerManager.startContainer(channel.user_id);
      await this.instancesService.updateContainerId(channel.user_id, newContainerId);
      this.logger.log(`Container started for Slack user ${channel.user_id}`);
    }

    await this.instancesService.updateLastActivity(channel.user_id);
    await this.supabase.db
      .from('channels')
      .update({ last_message_at: new Date().toISOString() })
      .eq('instance_id', channel.instance_id)
      .eq('type', 'slack');

    this.logger.log(`Slack message routed for user ${channel.user_id} in channel ${channelId}`);
  }
}

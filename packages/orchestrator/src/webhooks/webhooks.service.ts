import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ContainerManagerService } from '../containers/container-manager.service';
import { InstancesService } from '../instances/instances.service';
import { sha256 } from '../common/crypto/encrypt';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly containerManager: ContainerManagerService,
    private readonly instancesService: InstancesService,
  ) {}

  async handleTelegram(botToken: string, update: Record<string, unknown>) {
    const message = (update.message ?? update.edited_message) as Record<string, unknown> | undefined;
    if (!message) return;

    const chatId = (message.chat as Record<string, unknown>)?.id as number;
    const text = message.text as string | undefined;
    if (!chatId || !text) return;

    const tokenHash = sha256(botToken);
    const { data: channel } = await this.supabase.db
      .from('channels')
      .select('user_id, instance_id, instances(ecs_task_arn, ecs_task_def_arn, status)')
      .eq('type', 'telegram')
      .eq('is_active', true)
      .eq('identifier', tokenHash)
      .single();

    if (!channel) {
      this.logger.warn(`No channel found for bot token: ${botToken.slice(0, 8)}...`);
      return;
    }

    await this.supabase.db.from('usage_logs').insert({
      user_id: channel.user_id,
      action: 'message_received',
      metadata: { channel: 'telegram', chat_id: chatId },
    });

    const instance = channel.instances as unknown as Record<string, unknown>;
    const taskArn = instance?.ecs_task_arn as string | null;
    const taskDefArn = instance?.ecs_task_def_arn as string | null;

    if (!taskArn) {
      if (!taskDefArn) {
        this.logger.error(`No task definition for user ${channel.user_id}`);
        return;
      }
      await this.sendTelegramMessage(botToken, chatId, '잠깐만요, 준비 중이에요 🔄');

      const newTaskArn = await this.containerManager.startContainer(channel.user_id, taskDefArn);
      await this.instancesService.updateTaskArn(channel.user_id, newTaskArn);

      this.logger.log(`Container started for user ${channel.user_id}: ${newTaskArn}`);
    }

    await this.instancesService.updateLastActivity(channel.user_id);
    await this.supabase.db
      .from('channels')
      .update({ last_message_at: new Date().toISOString() })
      .eq('instance_id', channel.instance_id)
      .eq('type', 'telegram');

    this.logger.log(`Telegram message routed for user ${channel.user_id}`);
  }

  async handleSlack(body: Record<string, unknown>): Promise<string | undefined> {
    if (body.type === 'url_verification') {
      return body.challenge as string;
    }

    const event = body.event as Record<string, unknown> | undefined;
    if (!event || event.type !== 'message' || event.bot_id) return;

    const teamId = body.team_id as string;
    const text = event.text as string;
    const channelId = event.channel as string;

    if (!text || !channelId) return;

    const { data: channel } = await this.supabase.db
      .from('channels')
      .select('user_id, instance_id, instances(ecs_task_arn, ecs_task_def_arn, status)')
      .eq('type', 'slack')
      .eq('identifier', teamId)
      .eq('is_active', true)
      .single();

    if (!channel) {
      this.logger.warn(`No channel found for Slack team: ${teamId}`);
      return;
    }

    await this.supabase.db.from('usage_logs').insert({
      user_id: channel.user_id,
      action: 'message_received',
      metadata: { channel: 'slack', channel_id: channelId },
    });

    const instance = channel.instances as unknown as Record<string, unknown>;
    const taskArn = instance?.ecs_task_arn as string | null;
    const taskDefArn = instance?.ecs_task_def_arn as string | null;

    if (!taskArn && taskDefArn) {
      const newTaskArn = await this.containerManager.startContainer(channel.user_id, taskDefArn);
      await this.instancesService.updateTaskArn(channel.user_id, newTaskArn);
    }

    await this.instancesService.updateLastActivity(channel.user_id);
    return undefined;
  }

  private async sendTelegramMessage(botToken: string, chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}

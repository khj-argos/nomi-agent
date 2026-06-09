import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContainerManagerService } from './container-manager.service';
import { SessionDbService } from './session-db.service';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class MessageDispatchService {
  private readonly logger = new Logger(MessageDispatchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly containerManager: ContainerManagerService,
    private readonly sessionDb: SessionDbService,
    private readonly supabase: SupabaseService,
  ) {}

  async dispatch(
    userId: string,
    text: string,
    chatJid: string,
    onReply: (text: string) => Promise<void>,
  ): Promise<void> {
    const { data: instance } = await this.supabase.db
      .from('instances')
      .select('container_id, status, active_llm')
      .eq('user_id', userId)
      .single();

    const existingContainerId = instance?.container_id ?? null;
    const containerRunning = existingContainerId
      ? await this.containerManager.isContainerRunning(existingContainerId)
      : false;

    let llmChanged = false;
    if (containerRunning && existingContainerId) {
      const containerLlm = await this.containerManager.getContainerActiveLlm(existingContainerId);
      const dbLlm = instance?.active_llm ?? 'gemma_hosted';
      if (containerLlm && containerLlm !== dbLlm) {
        this.logger.log(`LLM changed for user ${userId} (${containerLlm} → ${dbLlm}), restarting`);
        llmChanged = true;
        try {
          await this.containerManager.stopContainer(existingContainerId);
        } catch (e) {
          this.logger.warn(`Failed to stop old container: ${e}`);
        }
      }
    }

    let containerId: string;

    if (!containerRunning || llmChanged) {
      this.logger.log(`Starting container for user ${userId}`);
      containerId = await this.containerManager.startContainer(userId);
      await this.supabase.db
        .from('instances')
        .update({
          container_id: containerId,
          status: 'running',
          last_activity: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      containerId = existingContainerId!;
      this.logger.log(`Container already running for user ${userId}`);
    }

    const [channelType, platformId] = chatJid.includes(':')
      ? chatJid.split(':', 2)
      : ['slack', chatJid];

    this.sessionDb.writeInbound(userId, text, channelType, platformId);

    void this.sessionDb
      .waitForReply(userId)
      .then(async (reply) => {
        if (reply) {
          await onReply(reply);
        } else {
          this.logger.warn(`No reply received for user ${userId} within timeout`);
        }
      })
      .catch((err) => this.logger.error(`Reply delivery failed for user ${userId}: ${err}`));
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContainerManagerService } from '../containers/container-manager.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { encrypt } from '../common/crypto/encrypt';

const DEFAULT_CLAUDE_MD = (assistantName: string) => `# ${assistantName}

You are ${assistantName}, a personal AI assistant. You help with tasks, answer questions, and can schedule reminders.

## What You Can Do

- Answer questions and have conversations
- Search the web and fetch content from URLs
- Read and write files in your workspace
- Run bash commands in your sandbox
- Schedule tasks to run later or on a recurring basis
- Send messages back to the chat

## Memory

The \`conversations/\` folder contains searchable history of past conversations.

When you learn something important:
- Create files for structured data (e.g., \`preferences.md\`)
- Keep an index in your memory for the files you create

## Communication

NEVER use markdown. Only use messaging app formatting:
- *bold* (single asterisks)
- _italic_ (underscores)
- \`\`\`code blocks\`\`\`
`;

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly containerManager: ContainerManagerService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateInstanceDto) {
    const { data: existing } = await this.supabase.db
      .from('instances')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      throw new ConflictException('Instance already exists for this user');
    }

    const assistantName = dto.assistantName ?? 'Andy';
    const agentConfig = dto.agentConfig ?? DEFAULT_CLAUDE_MD(assistantName);

    const { data: instance, error } = await this.supabase.db
      .from('instances')
      .insert({
        user_id: userId,
        status: 'creating',
        assistant_name: assistantName,
        agent_config: agentConfig,
        efs_path: `/users/${userId}`,
      })
      .select()
      .single();

    if (error || !instance) {
      throw new BadRequestException(`Failed to create instance: ${error?.message}`);
    }

    try {
      const taskDefArn = await this.containerManager.registerTaskDefinition(userId);

      await this.supabase.db
        .from('instances')
        .update({ status: 'stopped', ecs_task_def_arn: taskDefArn })
        .eq('id', instance.id);

      await this.supabase.db.from('instance_events').insert({
        instance_id: instance.id,
        user_id: userId,
        event_type: 'created',
        metadata: { assistant_name: assistantName },
      });

      await this.supabase.db.from('onboarding_progress').upsert({
        user_id: userId,
        current_step: 1,
      });

      if (dto.anthropicApiKey) {
        const aesKey = this.config.getOrThrow<string>('aesSecretKey');
        const { encrypted, iv, tag } = encrypt(dto.anthropicApiKey, aesKey);
        await this.supabase.db.from('user_api_keys').upsert({
          user_id: userId,
          anthropic_key: encrypted,
          key_iv: iv,
          key_tag: tag,
          is_verified: false,
        });
      }

      await this.createOnboardingSequences(userId, instance.id);

      return { ...instance, status: 'stopped', ecs_task_def_arn: taskDefArn };
    } catch (err) {
      await this.supabase.db
        .from('instances')
        .update({ status: 'error', error_message: String(err) })
        .eq('id', instance.id);
      throw err;
    }
  }

  async getByUserId(userId: string) {
    const { data, error } = await this.supabase.db
      .from('active_user_instances')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Instance not found');
    return data;
  }

  async updateConfig(userId: string, dto: UpdateConfigDto) {
    const instance = await this.getByUserId(userId);

    const updates: Record<string, string> = {};
    if (dto.assistantName) updates.assistant_name = dto.assistantName;
    if (dto.agentConfig) updates.agent_config = dto.agentConfig;

    const { error } = await this.supabase.db
      .from('instances')
      .update(updates)
      .eq('user_id', userId);

    if (error) throw new BadRequestException(`Failed to update config: ${error.message}`);

    await this.supabase.db.from('instance_events').insert({
      instance_id: instance.instance_id,
      user_id: userId,
      event_type: 'config_updated',
      metadata: { fields: Object.keys(updates) },
    });

    return { success: true };
  }

  async restart(userId: string) {
    const instance = await this.getByUserId(userId);

    if (instance.ecs_task_arn) {
      try {
        await this.containerManager.stopContainer(instance.ecs_task_arn);
      } catch {
        this.logger.warn(`Failed to stop container during restart for user ${userId}`);
      }
    }

    await this.supabase.db
      .from('instances')
      .update({ status: 'stopped', ecs_task_arn: null })
      .eq('user_id', userId);

    await this.supabase.db.from('instance_events').insert({
      instance_id: instance.instance_id,
      user_id: userId,
      event_type: 'restarted',
    });

    return { success: true };
  }

  async delete(userId: string) {
    const instance = await this.getByUserId(userId);

    if (instance.ecs_task_arn) {
      try {
        await this.containerManager.stopContainer(instance.ecs_task_arn);
      } catch {
        this.logger.warn(`Failed to stop container during deletion for user ${userId}`);
      }
    }

    await this.supabase.db.from('instances').delete().eq('user_id', userId);

    this.logger.log(`Instance deleted for user ${userId}. EFS data at /users/${userId} retained for 30 days.`);
    return { success: true };
  }

  async updateTaskArn(userId: string, taskArn: string | null) {
    const status = taskArn ? 'running' : 'stopped';
    await this.supabase.db
      .from('instances')
      .update({ ecs_task_arn: taskArn, status, last_activity: new Date().toISOString() })
      .eq('user_id', userId);
  }

  async updateLastActivity(userId: string) {
    await this.supabase.db
      .from('instances')
      .update({ last_activity: new Date().toISOString() })
      .eq('user_id', userId);
  }

  private async createOnboardingSequences(userId: string, instanceId: string) {
    const now = new Date();

    const makeDate = (daysFromNow: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + daysFromNow);
      d.setHours(9, 0, 0, 0);
      return d;
    };

    const day1 = makeDate(1);
    const day3 = makeDate(3);
    const day7 = makeDate(7);

    await this.supabase.db.from('schedules').insert([
      {
        user_id: userId,
        instance_id: instanceId,
        name: '첫 주 Day 1 메시지',
        action_type: 'first_week_day1',
        prompt: '어제 첫 대화를 했습니다. 가장 많이 부탁하고 싶은 일이 무엇인지 자연스럽게 물어보세요.',
        cron: `0 9 ${day1.getDate()} ${day1.getMonth() + 1} *`,
        next_run_at: day1.toISOString(),
        run_once: true,
      },
      {
        user_id: userId,
        instance_id: instanceId,
        name: '첫 주 Day 3 메시지',
        action_type: 'first_week_day3',
        prompt: 'conversations/ 폴더에서 지난 3일 대화를 검토하고, 사용자의 주요 관심사를 파악해서 관련 알림을 보내드릴지 제안하세요.',
        cron: `0 9 ${day3.getDate()} ${day3.getMonth() + 1} *`,
        next_run_at: day3.toISOString(),
        run_once: true,
      },
      {
        user_id: userId,
        instance_id: instanceId,
        name: '첫 주 Day 7 메시지',
        action_type: 'first_week_day7',
        prompt: '일주일이 됐습니다! conversations/ 폴더에서 지난 7일을 검토하고, 파악한 것들을 요약해서 보여주고 올바르게 이해했는지 확인하세요.',
        cron: `0 9 ${day7.getDate()} ${day7.getMonth() + 1} *`,
        next_run_at: day7.toISOString(),
        run_once: true,
      },
    ]);

    this.logger.log(`Onboarding sequences created for user ${userId}`);
  }
}

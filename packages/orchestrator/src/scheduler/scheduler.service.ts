import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ContainerManagerService } from '../containers/container-manager.service';
import { MessageDispatchService } from '../containers/message-dispatch.service';
import { InstancesService } from '../instances/instances.service';
import { SlackSocketService } from '../channels/slack-socket.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly containerManager: ContainerManagerService,
    private readonly messageDispatch: MessageDispatchService,
    private readonly instancesService: InstancesService,
    @Inject(forwardRef(() => SlackSocketService))
    private readonly slackSocket: SlackSocketService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runDueSchedules() {
    const now = new Date().toISOString();

    const { data: dueSchedules } = await this.supabase.db
      .from('schedules')
      .select('*, instances(container_id, status)')
      .eq('is_active', true)
      .lte('next_run_at', now);

    if (!dueSchedules?.length) return;

    this.logger.log(`Running ${dueSchedules.length} due schedule(s)`);

    for (const schedule of dueSchedules) {
      await this.runSchedule(schedule).catch(err =>
        this.logger.error(`Schedule ${schedule.id} failed: ${err}`)
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async stopIdleContainers() {
    const idleTimeoutMs = this.config.get<number>('container.idleTimeoutMs') ?? 3_600_000;
    const cutoff = new Date(Date.now() - idleTimeoutMs).toISOString();

    const { data: idleInstances } = await this.supabase.db
      .from('instances')
      .select('id, user_id, container_id')
      .eq('status', 'running')
      .lt('last_activity', cutoff);

    if (!idleInstances?.length) return;

    this.logger.log(`Stopping ${idleInstances.length} idle container(s)`);

    for (const instance of idleInstances) {
      try {
        if (instance.container_id) {
          await this.containerManager.stopContainer(instance.container_id);
        }
        await this.instancesService.updateContainerId(instance.user_id, null);

        await this.supabase.db.from('usage_logs').insert({
          user_id: instance.user_id,
          action: 'container_stopped',
          metadata: { reason: 'idle_timeout' },
        });

        this.logger.log(`Idle container stopped for user ${instance.user_id}`);
      } catch (err) {
        this.logger.error(`Failed to stop idle container for user ${instance.user_id}: ${err}`);
      }
    }
  }

  async createOnboardingSequence(userId: string, instanceId: string) {
    const now = new Date();

    const day1 = new Date(now);
    day1.setDate(day1.getDate() + 1);
    day1.setHours(9, 0, 0, 0);

    const day3 = new Date(now);
    day3.setDate(day3.getDate() + 3);
    day3.setHours(9, 0, 0, 0);

    const day7 = new Date(now);
    day7.setDate(day7.getDate() + 7);
    day7.setHours(9, 0, 0, 0);

    const sequences = [
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
    ];

    await this.supabase.db.from('schedules').insert(sequences);
    this.logger.log(`Onboarding sequences created for user ${userId}`);
  }

  private async runSchedule(schedule: Record<string, unknown>) {
    const userId = schedule.user_id as string;
    const prompt = schedule.prompt as string | null;

    if (!prompt?.trim()) {
      this.logger.warn(`Schedule ${schedule.id} has no prompt, skipping`);
      return;
    }

    const { data: lastMsg } = await this.supabase.db
      .from('usage_logs')
      .select('metadata')
      .eq('user_id', userId)
      .eq('action', 'message_received')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastChannelId = (lastMsg?.metadata as Record<string, string> | null)?.channel_id ?? null;

    let status = 'success';
    let error: string | null = null;

    try {
      await this.messageDispatch.dispatch(
        userId,
        prompt,
        `schedule:${schedule.id as string}`,
        async (reply: string) => {
          if (lastChannelId) {
            await this.slackSocket.sendMessage(lastChannelId, reply);
          } else {
            this.logger.warn(`No recent Slack channel for user ${userId}, schedule reply dropped`);
          }
        },
      );
    } catch (err) {
      status = 'error';
      error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Schedule ${schedule.id as string} dispatch failed: ${error}`);
    }

    await this.supabase.db.from('schedule_run_logs').insert({
      schedule_id: schedule.id,
      user_id: userId,
      status,
      ran_at: new Date().toISOString(),
    });

    await this.supabase.db.from('usage_logs').insert({
      user_id: userId,
      action: 'proactive_sent',
      metadata: { schedule_id: schedule.id, action_type: schedule.action_type },
    });

    if (schedule.run_once) {
      await this.supabase.db
        .from('schedules')
        .update({ is_active: false, last_run_at: new Date().toISOString() })
        .eq('id', schedule.id);
    } else {
      const nextRun = this.computeNextRun(schedule.cron as string);
      await this.supabase.db
        .from('schedules')
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRun,
          run_count: ((schedule.run_count as number) ?? 0) + 1,
        })
        .eq('id', schedule.id);
    }
  }

  private computeNextRun(cronExpression: string): string {
    const CronJob = require('cron').CronJob;
    try {
      const job = new CronJob(cronExpression, () => {}, null, false, 'Asia/Seoul');
      return job.nextDate().toISO() ?? new Date(Date.now() + 86_400_000).toISOString();
    } catch {
      return new Date(Date.now() + 86_400_000).toISOString();
    }
  }
}

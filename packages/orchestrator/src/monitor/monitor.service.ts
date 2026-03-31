import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ContainerManagerService } from '../containers/container-manager.service';
import { InstancesService } from '../instances/instances.service';

const MAX_AUTO_RESTART = 3;

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly containerManager: ContainerManagerService,
    private readonly instancesService: InstancesService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async detectCrashedContainers() {
    const { data: runningInstances } = await this.supabase.db
      .from('instances')
      .select('id, user_id, ecs_task_arn, restart_count, ecs_task_def_arn')
      .eq('status', 'running')
      .not('ecs_task_arn', 'is', null);

    if (!runningInstances?.length) return;

    for (const instance of runningInstances) {
      try {
        const status = await this.containerManager.getTaskStatus(instance.ecs_task_arn);

        if (status === 'stopped' || status === 'unknown') {
          this.logger.warn(`Crashed container detected for user ${instance.user_id}`);

          if ((instance.restart_count ?? 0) >= MAX_AUTO_RESTART) {
            await this.supabase.db
              .from('instances')
              .update({ status: 'error', error_message: 'Max restart attempts reached', ecs_task_arn: null })
              .eq('id', instance.id);
            this.logger.error(`User ${instance.user_id} reached max restarts. Manual intervention required.`);
            continue;
          }

          if (instance.ecs_task_def_arn) {
            const newTaskArn = await this.containerManager.startContainer(
              instance.user_id,
              instance.ecs_task_def_arn,
            );
            await this.supabase.db
              .from('instances')
              .update({
                ecs_task_arn: newTaskArn,
                status: 'running',
                restart_count: (instance.restart_count ?? 0) + 1,
                error_message: null,
              })
              .eq('id', instance.id);

            await this.supabase.db.from('instance_events').insert({
              instance_id: instance.id,
              user_id: instance.user_id,
              event_type: 'restarted',
              metadata: { reason: 'crash_detected', restart_count: (instance.restart_count ?? 0) + 1 },
            });

            this.logger.log(`Container auto-restarted for user ${instance.user_id} (attempt ${(instance.restart_count ?? 0) + 1})`);
          }
        }
      } catch (err) {
        this.logger.error(`Monitor check failed for user ${instance.user_id}: ${err}`);
      }
    }
  }
}

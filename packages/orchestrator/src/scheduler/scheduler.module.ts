import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ContainersModule } from '../containers/containers.module';
import { InstancesModule } from '../instances/instances.module';

@Module({
  imports: [ContainersModule, InstancesModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

import { Module, forwardRef } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ContainersModule } from '../containers/containers.module';
import { InstancesModule } from '../instances/instances.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [ContainersModule, InstancesModule, forwardRef(() => ChannelsModule)],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

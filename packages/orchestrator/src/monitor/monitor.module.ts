import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { ContainersModule } from '../containers/containers.module';
import { InstancesModule } from '../instances/instances.module';

@Module({
  imports: [ContainersModule, InstancesModule],
  providers: [MonitorService],
})
export class MonitorModule {}

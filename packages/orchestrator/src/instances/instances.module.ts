import { Module } from '@nestjs/common';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';
import { ContainersModule } from '../containers/containers.module';

@Module({
  imports: [ContainersModule],
  controllers: [InstancesController],
  providers: [InstancesService],
  exports: [InstancesService],
})
export class InstancesModule {}

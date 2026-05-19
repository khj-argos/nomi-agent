import { Module } from '@nestjs/common';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';
import { ContainersModule } from '../containers/containers.module';
import { LLMProxyModule } from '../llm-proxy/llm-proxy.module';

@Module({
  imports: [ContainersModule, LLMProxyModule],
  controllers: [InstancesController],
  providers: [InstancesService],
  exports: [InstancesService],
})
export class InstancesModule {}

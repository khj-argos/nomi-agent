import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ContainersModule } from '../containers/containers.module';
import { InstancesModule } from '../instances/instances.module';

@Module({
  imports: [ContainersModule, InstancesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { SlackSocketService } from './slack-socket.service';
import { ContainersModule } from '../containers/containers.module';
import { InstancesModule } from '../instances/instances.module';

@Module({
  imports: [ContainersModule, InstancesModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, SlackSocketService],
  exports: [ChannelsService, SlackSocketService],
})
export class ChannelsModule {}

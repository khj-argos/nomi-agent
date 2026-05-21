import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './common/config/configuration';
import { SupabaseModule } from './common/supabase/supabase.module';
import { ContainersModule } from './containers/containers.module';
import { InstancesModule } from './instances/instances.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { BillingModule } from './billing/billing.module';
import { MonitorModule } from './monitor/monitor.module';
import { ChannelsModule } from './channels/channels.module';
import { LLMProxyModule } from './llm-proxy/llm-proxy.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], envFilePath: ['.env', '../../.env'] }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    ContainersModule,
    InstancesModule,
    WebhooksModule,
    SchedulerModule,
    BillingModule,
    MonitorModule,
    ChannelsModule,
    LLMProxyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

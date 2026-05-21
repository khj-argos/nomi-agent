import { Module } from '@nestjs/common';
import { ContainerManagerService } from './container-manager.service';
import { MessageDispatchService } from './message-dispatch.service';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { LLMProxyModule } from '../llm-proxy/llm-proxy.module';

@Module({
  imports: [SupabaseModule, LLMProxyModule],
  providers: [ContainerManagerService, MessageDispatchService],
  exports: [ContainerManagerService, MessageDispatchService],
})
export class ContainersModule {}

import { Module } from '@nestjs/common';
import { ContainerManagerService } from './container-manager.service';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { LLMProxyModule } from '../llm-proxy/llm-proxy.module';

@Module({
  imports: [SupabaseModule, LLMProxyModule],
  providers: [ContainerManagerService],
  exports: [ContainerManagerService],
})
export class ContainersModule {}

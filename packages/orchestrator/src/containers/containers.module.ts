import { Module } from '@nestjs/common';
import { ContainerManagerService } from './container-manager.service';
import { SupabaseModule } from '../common/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [ContainerManagerService],
  exports: [ContainerManagerService],
})
export class ContainersModule {}

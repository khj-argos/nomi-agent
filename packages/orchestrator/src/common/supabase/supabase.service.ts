import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    this.client = createClient(
      this.config.getOrThrow('supabase.url'),
      this.config.getOrThrow('supabase.serviceRoleKey'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  get db(): SupabaseClient {
    return this.client;
  }
}

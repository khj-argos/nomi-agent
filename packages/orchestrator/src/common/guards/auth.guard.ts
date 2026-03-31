import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const token = authHeader.slice(7);

    const supabase = createClient(
      this.config.getOrThrow('supabase.url'),
      this.config.getOrThrow('supabase.serviceRoleKey'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    (req as Request & { user: { id: string; email: string } }).user = {
      id: data.user.id,
      email: data.user.email ?? '',
    };

    return true;
  }
}

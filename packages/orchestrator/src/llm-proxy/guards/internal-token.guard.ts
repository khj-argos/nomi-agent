import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { InternalTokenService } from '../internal-token/internal-token.service';

export interface InternalTokenContext {
  userId: string;
  instanceId: string;
}

declare module 'express' {
  interface Request {
    internalToken?: InternalTokenContext;
  }
}

@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly tokens: InternalTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];

    const bearer = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7)
      : undefined;
    const apiKey = typeof req.headers['x-api-key'] === 'string'
      ? (req.headers['x-api-key'] as string)
      : undefined;

    const raw = bearer ?? apiKey;
    if (!raw) {
      throw new UnauthorizedException('Missing internal token');
    }

    const claims = await this.tokens.verify(raw);
    req.internalToken = { userId: claims.sub, instanceId: claims.iid };
    return true;
  }
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { InternalTokenContext } from '../guards/internal-token.guard';

export const InternalCaller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): InternalTokenContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.internalToken) {
      throw new Error('InternalCaller used outside InternalTokenGuard scope');
    }
    return req.internalToken;
  },
);

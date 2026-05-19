import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { SupabaseService } from '../../common/supabase/supabase.service';

export interface InternalTokenClaims {
  sub: string;
  iid: string;
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class InternalTokenService {
  private readonly logger = new Logger(InternalTokenService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  private secret(): string {
    return this.config.getOrThrow<string>('llmProxy.internalSecret');
  }

  private ttlSeconds(): number {
    return this.config.getOrThrow<number>('llmProxy.tokenTtlSeconds');
  }

  async issue(userId: string, instanceId: string): Promise<string> {
    const jti = randomUUID();
    const token = jwt.sign(
      { sub: userId, iid: instanceId, jti },
      this.secret(),
      { algorithm: 'HS256', expiresIn: this.ttlSeconds() },
    );

    const { error } = await this.supabase.db
      .from('instances')
      .update({ internal_token_jti: jti })
      .eq('id', instanceId);

    if (error) {
      throw new Error(`Failed to record internal_token_jti: ${error.message}`);
    }

    return token;
  }

  async verify(token: string): Promise<InternalTokenClaims> {
    let claims: InternalTokenClaims;
    try {
      claims = jwt.verify(token, this.secret(), {
        algorithms: ['HS256'],
      }) as InternalTokenClaims;
    } catch (err) {
      throw new UnauthorizedException(
        `Invalid internal token: ${(err as Error).message}`,
      );
    }

    if (!claims.sub || !claims.iid || !claims.jti) {
      throw new UnauthorizedException('Internal token missing required claims');
    }

    const { data, error } = await this.supabase.db
      .from('instances')
      .select('internal_token_jti, user_id, id')
      .eq('id', claims.iid)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('Internal token references unknown instance');
    }

    if (data.internal_token_jti !== claims.jti) {
      throw new UnauthorizedException('Internal token has been revoked');
    }

    if (data.user_id !== claims.sub) {
      this.logger.warn(
        `Internal token user_id mismatch for instance ${claims.iid}: token.sub=${claims.sub} db.user_id=${data.user_id}`,
      );
      throw new UnauthorizedException('Internal token user mismatch');
    }

    return claims;
  }

  async revoke(instanceId: string): Promise<void> {
    const { error } = await this.supabase.db
      .from('instances')
      .update({ internal_token_jti: null })
      .eq('id', instanceId);

    if (error) {
      throw new Error(`Failed to revoke internal token: ${error.message}`);
    }
  }
}

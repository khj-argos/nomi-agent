import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../common/supabase/supabase.service';
import { createHmac } from 'crypto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  verifyWebhookSignature(rawBody: Buffer, signature: string): void {
    const secret = this.config.get<string>('lemonSqueezy.webhookSecret');
    if (!secret) return;

    const expected = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expected) {
      throw new UnauthorizedException('Invalid Lemon Squeezy webhook signature');
    }
  }

  async handleWebhook(eventName: string, payload: Record<string, unknown>) {
    this.logger.log(`Lemon Squeezy event: ${eventName}`);

    const attrs = (payload.data as Record<string, unknown>)?.attributes as Record<string, unknown>;
    const meta = payload.meta as Record<string, unknown>;
    const userId = (meta?.custom_data as Record<string, unknown>)?.user_id as string | undefined;

    switch (eventName) {
      case 'subscription_created':
        await this.onSubscriptionCreated(attrs, userId);
        break;
      case 'subscription_updated':
        await this.onSubscriptionUpdated(attrs);
        break;
      case 'order_created':
        await this.onOrderCreated(attrs, userId);
        break;
      case 'subscription_payment_failed':
        await this.onPaymentFailed(attrs);
        break;
      case 'subscription_cancelled':
        await this.onSubscriptionCancelled(attrs);
        break;
      default:
        this.logger.log(`Unhandled Lemon Squeezy event: ${eventName}`);
    }
  }

  private async onSubscriptionCreated(attrs: Record<string, unknown>, userId?: string) {
    if (!userId) { this.logger.warn('subscription_created: no user_id in custom_data'); return; }

    await this.supabase.db.from('subscriptions').upsert({
      user_id: userId,
      ls_customer_id: String(attrs.customer_id),
      ls_subscription_id: String(attrs.id ?? ''),
      ls_variant_id: String(attrs.variant_id),
      plan: this.resolvePlan(String(attrs.variant_id)),
      billing_cycle: attrs.billing_anchor ? 'monthly' : 'annual',
      status: 'on_trial',
      trial_ends_at: attrs.trial_ends_at as string | null,
      current_period_end: attrs.renews_at as string | null,
    }, { onConflict: 'ls_subscription_id' });

    await this.supabase.db
      .from('instances')
      .update({ status: 'stopped' })
      .eq('user_id', userId)
      .eq('status', 'pending');

    this.logger.log(`Subscription created for user ${userId}`);
  }

  private async onSubscriptionUpdated(attrs: Record<string, unknown>) {
    const lsSubId = String(attrs.id ?? '');
    await this.supabase.db
      .from('subscriptions')
      .update({
        status: this.mapLsStatus(String(attrs.status)),
        current_period_end: attrs.renews_at as string | null,
        updated_at: new Date().toISOString(),
      })
      .eq('ls_subscription_id', lsSubId);
  }

  private async onOrderCreated(attrs: Record<string, unknown>, userId?: string) {
    if (!userId) return;

    await this.supabase.db.from('payments').insert({
      user_id: userId,
      ls_order_id: String(attrs.id ?? ''),
      amount_krw: Math.round(Number(attrs.total ?? 0)),
      status: 'paid',
      paid_at: new Date().toISOString(),
    });
  }

  private async onPaymentFailed(attrs: Record<string, unknown>) {
    const lsSubId = String(attrs.id ?? '');
    await this.supabase.db
      .from('subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('ls_subscription_id', lsSubId);

    this.logger.warn(`Payment failed for subscription ${lsSubId}`);
  }

  private async onSubscriptionCancelled(attrs: Record<string, unknown>) {
    const lsSubId = String(attrs.id ?? '');
    await this.supabase.db
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('ls_subscription_id', lsSubId);

    this.logger.log(`Subscription cancelled: ${lsSubId}`);
  }

  private resolvePlan(variantId: string): 'starter' | 'pro' {
    const proVariants = (this.config.get<string>('lemonSqueezy.proVariantIds') ?? '').split(',');
    return proVariants.includes(variantId) ? 'pro' : 'starter';
  }

  private mapLsStatus(lsStatus: string): string {
    const map: Record<string, string> = {
      active: 'active',
      on_trial: 'on_trial',
      cancelled: 'cancelled',
      past_due: 'past_due',
      paused: 'paused',
      expired: 'expired',
    };
    return map[lsStatus] ?? 'active';
  }
}

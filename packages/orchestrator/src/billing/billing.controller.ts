import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string,
  ) {
    if (req.rawBody) {
      this.billingService.verifyWebhookSignature(req.rawBody, signature);
    }

    const body = req.body as Record<string, unknown>;
    const eventName = (body.meta as Record<string, unknown>)?.event_name as string;
    await this.billingService.handleWebhook(eventName, body);

    return { received: true };
  }
}

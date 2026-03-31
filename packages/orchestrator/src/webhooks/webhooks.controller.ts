import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('telegram/:botToken')
  async handleTelegram(
    @Param('botToken') botToken: string,
    @Body() update: Record<string, unknown>,
  ) {
    await this.webhooksService.handleTelegram(botToken, update);
    return { ok: true };
  }

  @Post('slack')
  async handleSlack(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const challenge = await this.webhooksService.handleSlack(body);
    if (challenge) {
      res.setHeader('Content-Type', 'text/plain');
      return challenge;
    }
    return { ok: true };
  }
}

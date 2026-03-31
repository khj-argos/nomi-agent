import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/user.decorator';
import { ChannelsService } from './channels.service';
import { ConnectSlackDto } from './dto/connect-slack.dto';
import { ConnectTelegramDto } from './dto/connect-telegram.dto';

@Controller('channels')
@UseGuards(AuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.channelsService.listChannels(user.id);
  }

  @Post('telegram')
  connectTelegram(@CurrentUser() user: AuthUser, @Body() dto: ConnectTelegramDto) {
    return this.channelsService.connectTelegram(user.id, dto);
  }

  @Post('slack')
  connectSlack(@CurrentUser() user: AuthUser, @Body() dto: ConnectSlackDto) {
    return this.channelsService.connectSlack(user.id, dto);
  }

  @Delete(':channelId')
  disconnect(@CurrentUser() user: AuthUser, @Param('channelId') channelId: string) {
    return this.channelsService.disconnectChannel(user.id, channelId);
  }
}

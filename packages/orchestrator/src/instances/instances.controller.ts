import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/user.decorator';
import { BudgetService } from '../llm-proxy/budget/budget.service';
import { InstancesService } from './instances.service';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

@Controller('instances')
@UseGuards(AuthGuard)
export class InstancesController {
  constructor(
    private readonly instancesService: InstancesService,
    private readonly budget: BudgetService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInstanceDto) {
    return this.instancesService.create(user.id, dto);
  }

  @Get('me')
  getMyInstance(@CurrentUser() user: AuthUser) {
    return this.instancesService.getByUserId(user.id);
  }

  @Get('me/config')
  getConfig(@CurrentUser() user: AuthUser) {
    return this.instancesService.getConfig(user.id);
  }

  @Put('me/config')
  updateConfig(@CurrentUser() user: AuthUser, @Body() dto: UpdateConfigDto) {
    return this.instancesService.updateConfig(user.id, dto);
  }

  @Get('me/usage')
  usage(@CurrentUser() user: AuthUser) {
    return this.budget.snapshot(user.id);
  }

  @Post('me/restart')
  restart(@CurrentUser() user: AuthUser) {
    return this.instancesService.restart(user.id);
  }

  @Delete('me')
  delete(@CurrentUser() user: AuthUser) {
    return this.instancesService.delete(user.id);
  }
}

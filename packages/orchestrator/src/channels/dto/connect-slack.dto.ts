import { IsOptional, IsString } from 'class-validator';

export class ConnectSlackDto {
  @IsString()
  botToken!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  teamName?: string;

  @IsOptional()
  @IsString()
  channelId?: string;
}

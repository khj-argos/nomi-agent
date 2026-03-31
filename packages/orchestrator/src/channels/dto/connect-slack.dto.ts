import { IsString } from 'class-validator';

export class ConnectSlackDto {
  @IsString()
  teamId!: string;

  @IsString()
  teamName!: string;

  @IsString()
  channelId!: string;
}

import { IsString } from 'class-validator';

export class ConnectTelegramDto {
  @IsString()
  botToken!: string;

  @IsString()
  botUsername!: string;
}

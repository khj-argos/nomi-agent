import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInstanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  assistantName?: string;

  @IsOptional()
  @IsString()
  agentConfig?: string;

  @IsOptional()
  @IsString()
  anthropicApiKey?: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  assistantName?: string;

  @IsOptional()
  @IsString()
  agentConfig?: string;
}

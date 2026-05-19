import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type ActiveLlm = 'gemma_hosted' | 'anthropic_byok';

export class UpdateConfigDto {
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

  @IsOptional()
  @IsIn(['gemma_hosted', 'anthropic_byok'])
  activeLlm?: ActiveLlm;

  @IsOptional()
  @IsBoolean()
  removeAnthropicKey?: boolean;
}

import { z } from 'zod';

const configSchema = z.object({
  PORT: z.string().default('4001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  ENGINE_IMAGE_URI: z.string().default('nanoclaw-agent:latest'),
  DATA_ROOT: z.string().default('/data/nanoclaw-instances'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  AES_SECRET_KEY: z.string().min(32),

  LEMON_SQUEEZY_API_KEY: z.string().optional(),
  LEMON_SQUEEZY_WEBHOOK_SECRET: z.string().optional(),

  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),

  CONTAINER_IDLE_TIMEOUT_MS: z.string().default('3600000'),
  CONTAINER_STARTUP_TIMEOUT_MS: z.string().default('30000'),

  WEBHOOK_BASE_URL: z.string().url().default('http://localhost:4001'),
  ALLOWED_ORIGINS: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Configuration validation failed:\n${result.error.toString()}`);
  }
  return result.data;
}

export default () => {
  const validated = validateConfig(process.env as Record<string, unknown>);
  return {
    port: parseInt(validated.PORT, 10),
    nodeEnv: validated.NODE_ENV,
    engine: {
      imageUri: validated.ENGINE_IMAGE_URI,
      dataRoot: validated.DATA_ROOT,
    },
    supabase: {
      url: validated.SUPABASE_URL,
      serviceRoleKey: validated.SUPABASE_SERVICE_ROLE_KEY,
      jwtSecret: validated.SUPABASE_JWT_SECRET ?? '',
    },
    aesSecretKey: validated.AES_SECRET_KEY,
    lemonSqueezy: {
      apiKey: validated.LEMON_SQUEEZY_API_KEY,
      webhookSecret: validated.LEMON_SQUEEZY_WEBHOOK_SECRET,
    },
    slack: {
      appToken: validated.SLACK_APP_TOKEN,
      botToken: validated.SLACK_BOT_TOKEN,
    },
    container: {
      idleTimeoutMs: parseInt(validated.CONTAINER_IDLE_TIMEOUT_MS, 10),
      startupTimeoutMs: parseInt(validated.CONTAINER_STARTUP_TIMEOUT_MS, 10),
    },
    webhookBaseUrl: validated.WEBHOOK_BASE_URL,
  };
};

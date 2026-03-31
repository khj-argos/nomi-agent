import { z } from 'zod';

const configSchema = z.object({
  PORT: z.string().default('4001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  AWS_REGION: z.string().default('ap-northeast-2'),
  AWS_ACCOUNT_ID: z.string(),
  ECS_CLUSTER_ARN: z.string(),
  ECS_TASK_EXECUTION_ROLE_ARN: z.string(),
  ECR_ENGINE_IMAGE_URI: z.string(),

  VPC_ID: z.string(),
  SUBNET_A: z.string(),
  SUBNET_C: z.string(),
  SECURITY_GROUP_CONTAINER: z.string(),

  EFS_FILE_SYSTEM_ID: z.string(),

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
    aws: {
      region: validated.AWS_REGION,
      accountId: validated.AWS_ACCOUNT_ID,
      ecs: {
        clusterArn: validated.ECS_CLUSTER_ARN,
        taskExecutionRoleArn: validated.ECS_TASK_EXECUTION_ROLE_ARN,
        imageUri: validated.ECR_ENGINE_IMAGE_URI,
      },
      vpc: {
        id: validated.VPC_ID,
        subnetA: validated.SUBNET_A,
        subnetC: validated.SUBNET_C,
        containerSg: validated.SECURITY_GROUP_CONTAINER,
      },
      efs: {
        fileSystemId: validated.EFS_FILE_SYSTEM_ID,
      },
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

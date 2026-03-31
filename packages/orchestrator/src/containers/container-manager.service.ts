import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
  DescribeTasksCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
  type Task,
} from '@aws-sdk/client-ecs';
import { SupabaseService } from '../common/supabase/supabase.service';
import { decrypt } from '../common/crypto/encrypt';

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'unknown';

@Injectable()
export class ContainerManagerService {
  private readonly logger = new Logger(ContainerManagerService.name);
  private readonly ecs: ECSClient;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.ecs = new ECSClient({ region: this.config.getOrThrow('aws.region') });
  }

  private async getAnthropicApiKey(userId: string): Promise<string | null> {
    const { data } = await this.supabase.db
      .from('user_api_keys')
      .select('anthropic_key, key_iv, key_tag')
      .eq('user_id', userId)
      .single();

    if (!data?.anthropic_key) return null;

    try {
      const aesKey = this.config.getOrThrow<string>('aesSecretKey');
      return decrypt(
        { encrypted: data.anthropic_key, iv: data.key_iv, tag: data.key_tag },
        aesKey,
      );
    } catch (err) {
      this.logger.error(`Failed to decrypt API key for user ${userId}: ${err}`);
      return null;
    }
  }

  async registerTaskDefinition(userId: string): Promise<string> {
    const imageUri = this.config.getOrThrow<string>('aws.ecs.imageUri');
    const executionRoleArn = this.config.getOrThrow<string>('aws.ecs.taskExecutionRoleArn');
    const logGroup = '/nanoclaw/user-containers';
    const region = this.config.getOrThrow<string>('aws.region');
    const efsId = this.config.getOrThrow<string>('aws.efs.fileSystemId');

    const result = await this.ecs.send(new RegisterTaskDefinitionCommand({
      family: `nanoclaw-user-${userId.replace(/-/g, '')}`,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: '512',
      memory: '1024',
      executionRoleArn,
      containerDefinitions: [
        {
          name: 'nanoclaw-engine',
          image: imageUri,
          essential: true,
          environment: [{ name: 'TZ', value: 'Asia/Seoul' }],
          mountPoints: [
            { containerPath: '/workspace/data', sourceVolume: 'user-data', readOnly: false },
          ],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': logGroup,
              'awslogs-region': region,
              'awslogs-stream-prefix': `user-${userId}`,
            },
          },
        },
      ],
      volumes: [
        {
          name: 'user-data',
          efsVolumeConfiguration: {
            fileSystemId: efsId,
            rootDirectory: `/users/${userId}`,
            transitEncryption: 'ENABLED',
          },
        },
      ],
    }));

    const arn = result.taskDefinition?.taskDefinitionArn;
    if (!arn) throw new Error(`Failed to register task definition for user ${userId}`);
    return arn;
  }

  async startContainer(userId: string, taskDefArn: string): Promise<string> {
    this.logger.log(`Starting container for user ${userId}`);

    const clusterArn = this.config.getOrThrow<string>('aws.ecs.clusterArn');
    const subnetA = this.config.getOrThrow<string>('aws.vpc.subnetA');
    const subnetC = this.config.getOrThrow<string>('aws.vpc.subnetC');
    const containerSg = this.config.getOrThrow<string>('aws.vpc.containerSg');

    const anthropicApiKey = await this.getAnthropicApiKey(userId);
    if (!anthropicApiKey) {
      this.logger.warn(`No Anthropic API key found for user ${userId}`);
    }

    const environment = [
      { name: 'TZ', value: 'Asia/Seoul' },
      ...(anthropicApiKey ? [{ name: 'ANTHROPIC_API_KEY', value: anthropicApiKey }] : []),
    ];

    const result = await this.ecs.send(new RunTaskCommand({
      cluster: clusterArn,
      taskDefinition: taskDefArn,
      launchType: 'FARGATE',
      overrides: {
        containerOverrides: [{ name: 'nanoclaw-engine', environment }],
      },
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [subnetA, subnetC],
          securityGroups: [containerSg],
          assignPublicIp: 'ENABLED',
        },
      },
      tags: [
        { key: 'userId', value: userId },
        { key: 'project', value: 'nanoclaw' },
      ],
    }));

    const taskArn = result.tasks?.[0]?.taskArn;
    if (!taskArn) {
      const reason = result.failures?.[0]?.reason ?? 'Unknown';
      throw new Error(`Failed to start container for user ${userId}: ${reason}`);
    }

    return taskArn;
  }

  async stopContainer(taskArn: string): Promise<void> {
    const clusterArn = this.config.getOrThrow<string>('aws.ecs.clusterArn');
    this.logger.log(`Stopping container: ${taskArn}`);

    await this.ecs.send(new StopTaskCommand({
      cluster: clusterArn,
      task: taskArn,
      reason: 'Idle timeout or manual stop',
    }));
  }

  async getTaskStatus(taskArn: string): Promise<ContainerStatus> {
    const clusterArn = this.config.getOrThrow<string>('aws.ecs.clusterArn');

    try {
      const result = await this.ecs.send(new DescribeTasksCommand({
        cluster: clusterArn,
        tasks: [taskArn],
      }));

      const task = result.tasks?.[0];
      if (!task) return 'stopped';

      return this.mapTaskStatus(task);
    } catch {
      return 'unknown';
    }
  }

  async ensureRunning(taskArn: string): Promise<void> {
    const status = await this.getTaskStatus(taskArn);
    if (status === 'running') return;

    const timeoutMs = this.config.get<number>('container.startupTimeoutMs') ?? 30_000;
    const pollInterval = 2_000;
    const maxAttempts = Math.ceil(timeoutMs / pollInterval);

    for (let i = 0; i < maxAttempts; i++) {
      const current = await this.getTaskStatus(taskArn);
      if (current === 'running') return;
      if (current === 'stopped' || current === 'unknown') {
        throw new Error(`Container ${taskArn} stopped unexpectedly during startup`);
      }
      await this.sleep(pollInterval);
    }

    throw new Error(`Container ${taskArn} did not become ready within ${timeoutMs}ms`);
  }

  async listRunningTasks(): Promise<Task[]> {
    const clusterArn = this.config.getOrThrow<string>('aws.ecs.clusterArn');

    const listResult = await this.ecs.send(new ListTasksCommand({
      cluster: clusterArn,
      desiredStatus: 'RUNNING',
    }));

    if (!listResult.taskArns?.length) return [];

    const describeResult = await this.ecs.send(new DescribeTasksCommand({
      cluster: clusterArn,
      tasks: listResult.taskArns,
    }));

    return describeResult.tasks ?? [];
  }

  private mapTaskStatus(task: Task): ContainerStatus {
    const last = task.lastStatus?.toUpperCase();
    const desired = task.desiredStatus?.toUpperCase();

    if (last === 'RUNNING') return 'running';
    if (last === 'STOPPED') return 'stopped';
    if (last === 'PENDING' || last === 'PROVISIONING') return 'starting';
    if (desired === 'STOPPED' && last !== 'STOPPED') return 'stopping';
    return 'unknown';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

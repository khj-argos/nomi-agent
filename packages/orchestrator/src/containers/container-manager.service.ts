import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';
import { SupabaseService } from '../common/supabase/supabase.service';
import { decrypt } from '../common/crypto/encrypt';

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'unknown';

const MANAGED_LABEL = 'nanoclaw.managed';
const USER_ID_LABEL = 'nanoclaw.user_id';

@Injectable()
export class ContainerManagerService {
  private readonly logger = new Logger(ContainerManagerService.name);
  private readonly docker: Dockerode;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  private containerName(userId: string): string {
    return `nanoclaw-user-${userId.replace(/-/g, '')}`;
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

  async startContainer(userId: string): Promise<string> {
    this.logger.log(`Starting container for user ${userId}`);

    const imageUri = this.config.getOrThrow<string>('engine.imageUri');
    const dataRoot = this.config.getOrThrow<string>('engine.dataRoot');
    const name = this.containerName(userId);
    const hostDataPath = `${dataRoot}/${userId}`;

    try {
      const existing = this.docker.getContainer(name);
      const info = await existing.inspect();
      if (!info.State.Running) {
        await existing.remove();
        this.logger.log(`Removed stale container: ${name}`);
      }
    } catch (_) {}

    const anthropicApiKey = await this.getAnthropicApiKey(userId);
    if (!anthropicApiKey) {
      this.logger.warn(`No Anthropic API key found for user ${userId}`);
    }

    const env: string[] = [
      'TZ=Asia/Seoul',
      ...(anthropicApiKey ? [`ANTHROPIC_API_KEY=${anthropicApiKey}`] : []),
    ];

    const container = await this.docker.createContainer({
      Image: imageUri,
      name,
      Env: env,
      Labels: {
        [MANAGED_LABEL]: 'true',
        [USER_ID_LABEL]: userId,
      },
      HostConfig: {
        Binds: [`${hostDataPath}:/workspace/data`],
        RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
      },
    });

    await container.start();
    this.logger.log(`Container started for user ${userId}: ${container.id}`);
    return container.id;
  }

  async stopContainer(containerId: string): Promise<void> {
    this.logger.log(`Stopping container: ${containerId}`);
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 10 });
      await container.remove();
    } catch (err) {
      this.logger.warn(`Error stopping container ${containerId}: ${err}`);
    }
  }

  async getTaskStatus(containerId: string): Promise<ContainerStatus> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      const { Running, Paused, Dead, OOMKilled } = info.State;

      if (Running) return 'running';
      if (Paused) return 'stopping';
      if (Dead || OOMKilled) return 'stopped';
      return 'stopped';
    } catch {
      // 컨테이너를 찾을 수 없음 = 중지됨
      return 'stopped';
    }
  }

  async ensureRunning(containerId: string): Promise<void> {
    const status = await this.getTaskStatus(containerId);
    if (status === 'running') return;

    const timeoutMs = this.config.get<number>('container.startupTimeoutMs') ?? 30_000;
    const pollInterval = 2_000;
    const maxAttempts = Math.ceil(timeoutMs / pollInterval);

    for (let i = 0; i < maxAttempts; i++) {
      const current = await this.getTaskStatus(containerId);
      if (current === 'running') return;
      if (current === 'stopped') {
        throw new Error(`Container ${containerId} stopped unexpectedly during startup`);
      }
      await this.sleep(pollInterval);
    }

    throw new Error(`Container ${containerId} did not become ready within ${timeoutMs}ms`);
  }

  async listRunningContainers(): Promise<Dockerode.ContainerInfo[]> {
    return this.docker.listContainers({
      filters: JSON.stringify({
        label: [`${MANAGED_LABEL}=true`],
        status: ['running'],
      }),
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

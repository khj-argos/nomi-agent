import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';
import { SupabaseService } from '../common/supabase/supabase.service';
import { InternalTokenService } from '../llm-proxy/internal-token/internal-token.service';

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'unknown';

const MANAGED_LABEL = 'nanoclaw.managed';
const USER_ID_LABEL = 'nanoclaw.user_id';
const INSTANCE_ID_LABEL = 'nanoclaw.instance_id';

@Injectable()
export class ContainerManagerService {
  private readonly logger = new Logger(ContainerManagerService.name);
  private readonly docker: Dockerode;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly internalTokens: InternalTokenService,
  ) {
    this.docker = new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  private containerName(userId: string): string {
    return `nanoclaw-user-${userId.replace(/-/g, '')}`;
  }

  private async resolveInstance(userId: string): Promise<{ id: string }> {
    const { data, error } = await this.supabase.db
      .from('instances')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        `No instance found for user ${userId} — cannot start container without an instances row`,
      );
    }
    return { id: data.id };
  }

  async startContainer(userId: string): Promise<string> {
    this.logger.log(`Starting container for user ${userId}`);

    const instance = await this.resolveInstance(userId);
    const imageUri = this.config.getOrThrow<string>('engine.imageUri');
    const dataRoot = this.config.getOrThrow<string>('engine.dataRoot');
    const proxyUrl = this.config.getOrThrow<string>('llmProxy.publicUrl');
    const networkName = this.config.getOrThrow<string>('agent.dockerNetwork');
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

    const internalToken = await this.internalTokens.issue(userId, instance.id);

    const env: string[] = [
      'TZ=Asia/Seoul',
      `ANTHROPIC_BASE_URL=${trimTrailingSlash(proxyUrl)}/llm/v1`,
      `ANTHROPIC_AUTH_TOKEN=${internalToken}`,
    ];

    const container = await this.docker.createContainer({
      Image: imageUri,
      name,
      Env: env,
      Labels: {
        [MANAGED_LABEL]: 'true',
        [USER_ID_LABEL]: userId,
        [INSTANCE_ID_LABEL]: instance.id,
      },
      HostConfig: {
        Binds: [`${hostDataPath}:/workspace/data`],
        RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
        NetworkMode: networkName,
      },
    });

    await container.start();
    this.logger.log(`Container started for user ${userId}: ${container.id}`);
    return container.id;
  }

  async stopContainer(containerId: string): Promise<void> {
    this.logger.log(`Stopping container: ${containerId}`);
    let instanceId: string | undefined;
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      instanceId = info.Config?.Labels?.[INSTANCE_ID_LABEL];
      await container.stop({ t: 10 });
      await container.remove();
    } catch (err) {
      this.logger.warn(`Error stopping container ${containerId}: ${err}`);
    }

    if (instanceId) {
      try {
        await this.internalTokens.revoke(instanceId);
      } catch (err) {
        this.logger.warn(
          `Failed to revoke internal token for instance ${instanceId}: ${(err as Error).message}`,
        );
      }
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

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

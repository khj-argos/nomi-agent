import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';
import { SupabaseService } from '../common/supabase/supabase.service';
import { InternalTokenService } from '../llm-proxy/internal-token/internal-token.service';
import { SessionDbService } from './session-db.service';

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'unknown';

const MANAGED_LABEL = 'nanoclaw.managed';
const USER_ID_LABEL = 'nanoclaw.user_id';
const INSTANCE_ID_LABEL = 'nanoclaw.instance_id';
const ACTIVE_LLM_LABEL = 'nanoclaw.active_llm';

@Injectable()
export class ContainerManagerService {
  private readonly logger = new Logger(ContainerManagerService.name);
  private readonly docker: Dockerode;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly internalTokens: InternalTokenService,
    private readonly sessionDb: SessionDbService,
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
        `No instance found for user ${userId}`,
      );
    }
    return { id: data.id };
  }

  async startContainer(userId: string): Promise<string> {
    this.logger.log(`Starting container for user ${userId}`);

    const instance = await this.resolveInstance(userId);
    const imageUri = this.config.getOrThrow<string>('engine.imageUri');
    const proxyUrl = this.config.getOrThrow<string>('llmProxy.publicUrl');
    const networkName = this.config.getOrThrow<string>('agent.dockerNetwork');
    const name = this.containerName(userId);
    const workspacePath = this.sessionDb.workspacePath(userId);

    const { data: instanceData } = await this.supabase.db
      .from('instances')
      .select('active_llm')
      .eq('user_id', userId)
      .single();
    const activeLlm = instanceData?.active_llm ?? 'gemma_hosted';

    this.sessionDb.bootstrapWorkspace(userId, {
      assistantName: 'Nomi',
      provider: activeLlm === 'anthropic_byok' ? 'claude' : 'ollama',
    });

    try {
      const existing = this.docker.getContainer(name);
      const info = await existing.inspect();
      if (!info.State.Running) {
        await existing.remove();
        this.logger.log(`Removed stale container: ${name}`);
      } else {
        return existing.id;
      }
    } catch (_) {}

    const internalToken = await this.internalTokens.issue(userId, instance.id);
    const ollamaModel = this.config.getOrThrow<string>('llmProxy.ollamaDefaultModel');
    const ollamaBaseUrl = this.config.getOrThrow<string>('llmProxy.ollamaBaseUrl');

    const env: string[] =
      activeLlm === 'anthropic_byok'
        ? [
            'TZ=Asia/Seoul',
            `ANTHROPIC_BASE_URL=${trimTrailingSlash(proxyUrl)}/llm/v1`,
            `ANTHROPIC_AUTH_TOKEN=${internalToken}`,
          ]
        : [
            'TZ=Asia/Seoul',
            `OLLAMA_BASE_URL=${ollamaBaseUrl}`,
            `OLLAMA_MODEL=${ollamaModel}`,
          ];

    const container = await this.docker.createContainer({
      Image: imageUri,
      name,
      Env: env,
      Labels: {
        [MANAGED_LABEL]: 'true',
        [USER_ID_LABEL]: userId,
        [INSTANCE_ID_LABEL]: instance.id,
        [ACTIVE_LLM_LABEL]: activeLlm,
      },
      HostConfig: {
        Binds: [`${workspacePath}:/workspace`],
        RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
        NetworkMode: networkName,
      },
    });

    await container.start();
    this.logger.log(`Container started for user ${userId}: ${container.id}`);
    return container.id;
  }

  async getContainerActiveLlm(containerId: string): Promise<string | null> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return info.Config?.Labels?.[ACTIVE_LLM_LABEL] ?? null;
    } catch {
      return null;
    }
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

  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return info.State.Running === true;
    } catch {
      return false;
    }
  }

  async getContainerIdByName(userId: string): Promise<string | null> {
    try {
      const info = await this.docker.getContainer(this.containerName(userId)).inspect();
      return info.State.Running ? info.Id : null;
    } catch {
      return null;
    }
  }

  async getTaskStatus(containerId: string): Promise<ContainerStatus> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      const { Running, Paused, Dead, OOMKilled } = info.State;
      if (Running) return 'running';
      if (Paused) return 'stopping';
      if (Dead || OOMKilled) return 'stopped';
      return 'stopped';
    } catch {
      return 'stopped';
    }
  }

  async listRunningContainers(): Promise<Dockerode.ContainerInfo[]> {
    return this.docker.listContainers({
      filters: JSON.stringify({
        label: [`${MANAGED_LABEL}=true`],
        status: ['running'],
      }),
    });
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

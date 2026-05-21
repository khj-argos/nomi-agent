import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContainerManagerService } from './container-manager.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import Dockerode from 'dockerode';
import fs from 'fs';
import path from 'path';

const OUTPUT_START = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END = '---NANOCLAW_OUTPUT_END---';

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  error?: string;
}

@Injectable()
export class MessageDispatchService {
  private readonly logger = new Logger(MessageDispatchService.name);
  private readonly watchers = new Map<string, NodeJS.Timeout>();
  private readonly stdoutWatchers = new Map<string, boolean>();
  private readonly docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

  constructor(
    private readonly config: ConfigService,
    private readonly containerManager: ContainerManagerService,
    private readonly supabase: SupabaseService,
  ) {}

  private async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return info.State.Running === true;
    } catch {
      return false;
    }
  }

  async dispatch(
    userId: string,
    text: string,
    chatJid: string,
    onReply: (text: string) => Promise<void>,
  ): Promise<void> {
    const dataRoot = this.config.getOrThrow<string>('engine.dataRoot');
    const ipcInputDir = path.join(dataRoot, userId, 'ipc', 'input');
    const ipcMessagesDir = path.join(dataRoot, userId, 'ipc', 'messages');

    fs.mkdirSync(ipcInputDir, { recursive: true });
    fs.mkdirSync(ipcMessagesDir, { recursive: true });

    const { data: instance } = await this.supabase.db
      .from('instances')
      .select('container_id, status, active_llm')
      .eq('user_id', userId)
      .single();

    const containerRunning = instance?.container_id
      ? await this.isContainerRunning(instance.container_id)
      : false;

    let llmChanged = false;
    if (containerRunning && instance?.container_id) {
      const containerLlm = await this.containerManager.getContainerActiveLlm(instance.container_id);
      const dbLlm = instance.active_llm ?? 'gemma_hosted';
      if (containerLlm && containerLlm !== dbLlm) {
        this.logger.log(`LLM changed for user ${userId} (${containerLlm} → ${dbLlm}), restarting container`);
        llmChanged = true;
        try {
          await this.containerManager.stopContainer(instance.container_id);
        } catch (e) {
          this.logger.warn(`Failed to stop old container: ${e}`);
        }
      }
    }

    let containerId: string;

    if (!containerRunning || llmChanged) {
      this.logger.log(`Starting container for user ${userId} with message...`);
      containerId = await this.containerManager.startContainerWithMessage(userId, text, chatJid);
      await this.supabase.db
        .from('instances')
        .update({ container_id: containerId, status: 'running', last_activity: new Date().toISOString() })
        .eq('user_id', userId);
    } else {
      containerId = instance!.container_id!;
      this.logger.log(`Container running for user ${userId}, sending via IPC...`);
      this.writeIpcInput(ipcInputDir, text);
    }

    this.watchForReply(userId, containerId, ipcMessagesDir, onReply);
  }

  private writeIpcInput(dir: string, text: string): void {
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const tempPath = path.join(dir, `${filename}.tmp`);
    const finalPath = path.join(dir, filename);
    fs.writeFileSync(tempPath, JSON.stringify({ type: 'message', text }));
    fs.renameSync(tempPath, finalPath);
    this.logger.log(`IPC input written: ${filename}`);
  }

  private watchForReply(
    userId: string,
    containerId: string,
    ipcMessagesDir: string,
    onReply: (text: string) => Promise<void>,
  ): void {
    if (this.watchers.has(userId)) return;

    this.watchContainerStdout(userId, containerId, onReply);
    this.watchIpcMessages(userId, ipcMessagesDir, onReply);
  }

  private watchContainerStdout(
    userId: string,
    containerId: string,
    onReply: (text: string) => Promise<void>,
  ): void {
    if (this.stdoutWatchers.get(userId)) return;
    this.stdoutWatchers.set(userId, true);

    const container = this.docker.getContainer(containerId);
    let buffer = '';

    container.logs({ follow: true, stdout: true, stderr: true, tail: 0 }, (err, stream) => {
      if (err || !stream) {
        this.logger.warn(`Failed to attach to container stdout for user ${userId}: ${err}`);
        this.stdoutWatchers.delete(userId);
        return;
      }

      stream.on('data', (chunk: Buffer) => {
        let offset = 0;
        let payload = '';
        while (offset < chunk.length) {
          if (chunk.length - offset < 8) {
            payload += chunk.slice(offset).toString('utf8');
            break;
          }
          const frameSize = chunk.readUInt32BE(offset + 4);
          offset += 8;
          if (frameSize > 0 && offset + frameSize <= chunk.length) {
            payload += chunk.slice(offset, offset + frameSize).toString('utf8');
            offset += frameSize;
          } else {
            payload += chunk.slice(offset).toString('utf8');
            break;
          }
        }
        const text = payload.replace(/[\x00-\x08\x0e-\x1f]/g, '');
        buffer += text;

        while (true) {
          const startIdx = buffer.indexOf(OUTPUT_START);
          if (startIdx === -1) break;
          const endIdx = buffer.indexOf(OUTPUT_END, startIdx);
          if (endIdx === -1) break;

          const jsonStr = buffer.slice(startIdx + OUTPUT_START.length, endIdx).trim();
          buffer = buffer.slice(endIdx + OUTPUT_END.length);

          try {
            const output: ContainerOutput = JSON.parse(jsonStr);
            if (output.status === 'success' && output.result) {
              this.logger.log(`Stdout reply for user ${userId}: ${output.result.slice(0, 80)}`);
              onReply(output.result).catch(e => this.logger.error(`Reply send failed: ${e}`));
            } else if (output.status === 'error' && output.error) {
              this.logger.error(`Agent error for user ${userId}: ${output.error}`);
            }
          } catch (e) {
            this.logger.warn(`Failed to parse agent output: ${e}`);
          }
        }
      });

      stream.on('end', () => {
        this.stdoutWatchers.delete(userId);
        this.logger.log(`Container stdout ended for user ${userId}`);
      });

      stream.on('error', (e: Error) => {
        this.stdoutWatchers.delete(userId);
        this.logger.warn(`Container stdout error for user ${userId}: ${e}`);
      });
    });
  }

  private watchIpcMessages(
    userId: string,
    messagesDir: string,
    onReply: (text: string) => Promise<void>,
  ): void {
    const POLL_MS = 500;
    const TIMEOUT_MS = 120_000;
    const startedAt = Date.now();
    const seen = new Set<string>();

    const poll = async () => {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        this.watchers.delete(userId);
        return;
      }

      try {
        const files = fs.readdirSync(messagesDir)
          .filter(f => f.endsWith('.json') && !seen.has(f))
          .sort();

        for (const file of files) {
          seen.add(file);
          const filePath = path.join(messagesDir, file);
          try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            fs.unlinkSync(filePath);
            if (data.type === 'message' && data.text) {
              this.logger.log(`IPC reply for user ${userId}: ${data.text.slice(0, 80)}`);
              await onReply(data.text).catch(e => this.logger.error(`Reply send failed: ${e}`));
            }
          } catch (e) {
            this.logger.warn(`Failed to process IPC message ${file}: ${e}`);
          }
        }
      } catch (e) {
        this.logger.warn(`IPC messages dir read error: ${e}`);
      }

      const timeout = setTimeout(poll, POLL_MS);
      this.watchers.set(userId, timeout);
    };

    const timeout = setTimeout(poll, POLL_MS);
    this.watchers.set(userId, timeout);
  }

  stopWatcher(userId: string): void {
    const timeout = this.watchers.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.watchers.delete(userId);
    }
    this.stdoutWatchers.delete(userId);
  }
}

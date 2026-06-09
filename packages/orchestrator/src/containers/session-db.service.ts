import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const POLL_INTERVAL_MS = 500;
const REPLY_TIMEOUT_MS = 300_000;

@Injectable()
export class SessionDbService {
  private readonly logger = new Logger(SessionDbService.name);

  constructor(private readonly config: ConfigService) {}

  workspacePath(userId: string): string {
    const dataRoot = this.config.getOrThrow<string>('engine.dataRoot');
    return path.join(dataRoot, userId);
  }

  openInbound(userId: string): Database.Database {
    const dbPath = path.join(this.workspacePath(userId), 'inbound.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = DELETE');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    this.ensureInboundSchema(db);
    return db;
  }

  openOutbound(userId: string): Database.Database {
    const dbPath = path.join(this.workspacePath(userId), 'outbound.db');
    if (!fs.existsSync(dbPath)) return null as unknown as Database.Database;
    const db = new Database(dbPath, { readonly: true });
    db.pragma('busy_timeout = 5000');
    db.pragma('mmap_size = 0');
    return db;
  }

  writeInbound(
    userId: string,
    text: string,
    channelType: string,
    platformId: string,
    threadId: string | null = null,
  ): string {
    const db = this.openInbound(userId);
    try {
      const id = randomUUID();
      const maxSeq = (
        db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM messages_in').get() as { m: number }
      ).m;
      // next even number
      const seq = maxSeq % 2 === 0 ? maxSeq + 2 : maxSeq + 1;

      db.prepare(
        `INSERT INTO messages_in
           (id, seq, kind, timestamp, status, tries, trigger, platform_id, channel_type, thread_id, content)
         VALUES
           (?, ?, 'chat', datetime('now'), 'pending', 0, 1, ?, ?, ?, ?)`,
      ).run(id, seq, platformId, channelType, threadId, JSON.stringify({ text }));

      this.logger.log(`Written inbound msg ${id} seq=${seq} for user ${userId}`);
      return id;
    } finally {
      db.close();
    }
  }

  bootstrapWorkspace(
    userId: string,
    opts: {
      assistantName?: string;
      provider?: string;
      model?: string;
      claudeMd?: string;
    } = {},
  ): void {
    const ws = this.workspacePath(userId);
    const agentDir = path.join(ws, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });

    const containerJson = {
      provider: opts.provider ?? 'claude',
      assistantName: opts.assistantName ?? 'Nomi',
      groupName: 'main',
      agentGroupId: userId,
      maxMessagesPerPrompt: 10,
      mcpServers: {},
      ...(opts.model ? { model: opts.model } : {}),
    };
    fs.writeFileSync(
      path.join(agentDir, 'container.json'),
      JSON.stringify(containerJson, null, 2),
    );

    const claudeMdPath = path.join(agentDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      fs.writeFileSync(
        claudeMdPath,
        opts.claudeMd ??
          `# ${containerJson.assistantName}\n\nYou are a helpful AI assistant named ${containerJson.assistantName}.\n`,
      );
    }

    const db = this.openInbound(userId);
    db.close();

    this.logger.log(`Workspace bootstrapped for user ${userId}`);
  }

  async waitForReply(
    userId: string,
    timeoutMs: number = REPLY_TIMEOUT_MS,
  ): Promise<string | null> {
    const startedAt = Date.now();
    const deliveredIds = new Set<string>();

    while (Date.now() - startedAt < timeoutMs) {
      const outbound = this.openOutbound(userId);
      if (!outbound) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      try {
        const tableExists = (
          outbound
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_out'")
            .get() as { name: string } | undefined
        )?.name;

        if (!tableExists) {
          await sleep(POLL_INTERVAL_MS);
          continue;
        }

        const rows = outbound
          .prepare(
            `SELECT id, content FROM messages_out
             WHERE kind = 'chat'
               AND (deliver_after IS NULL OR deliver_after <= datetime('now'))
             ORDER BY timestamp ASC`,
          )
          .all() as Array<{ id: string; content: string }>;

        for (const row of rows) {
          if (deliveredIds.has(row.id)) continue;
          deliveredIds.add(row.id);

          try {
            const parsed = JSON.parse(row.content) as { text?: string };
            if (parsed.text?.trim()) {
              this.markDelivered(userId, row.id);
              return parsed.text;
            }
          } catch (_) {}
        }
      } catch (err) {
        this.logger.warn(`outbound.db poll error for user ${userId}: ${err}`);
      } finally {
        outbound.close();
      }

      await sleep(POLL_INTERVAL_MS);
    }

    this.logger.warn(`Reply timeout (${timeoutMs}ms) for user ${userId}`);
    return null;
  }

  private markDelivered(userId: string, messageOutId: string): void {
    try {
      const db = this.openInbound(userId);
      try {
        db.prepare(
          `INSERT OR IGNORE INTO delivered (message_out_id, status, delivered_at)
           VALUES (?, 'delivered', datetime('now'))`,
        ).run(messageOutId);
      } finally {
        db.close();
      }
    } catch (err) {
      this.logger.warn(`markDelivered failed for ${messageOutId}: ${err}`);
    }
  }

  private ensureInboundSchema(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages_in (
        id             TEXT PRIMARY KEY,
        seq            INTEGER UNIQUE,
        kind           TEXT NOT NULL,
        timestamp      TEXT NOT NULL,
        status         TEXT DEFAULT 'pending',
        process_after  TEXT,
        recurrence     TEXT,
        series_id      TEXT,
        tries          INTEGER DEFAULT 0,
        trigger        INTEGER NOT NULL DEFAULT 1,
        platform_id    TEXT,
        channel_type   TEXT,
        thread_id      TEXT,
        content        TEXT NOT NULL,
        on_wake        INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS delivered (
        message_out_id      TEXT PRIMARY KEY,
        platform_message_id TEXT,
        status              TEXT NOT NULL DEFAULT 'delivered',
        delivered_at        TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS destinations (
        name            TEXT PRIMARY KEY,
        display_name    TEXT,
        type            TEXT NOT NULL,
        channel_type    TEXT,
        platform_id     TEXT,
        agent_group_id  TEXT
      );
    `);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

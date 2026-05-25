import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { DEFAULT_DB_PATH } from '@modelmule/config';

export interface RequestLog {
  providerId: string;
  model: string;
  taskType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  status: 'ok' | 'error';
  errorMessage?: string;
}

export class UsageStore {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? process.env.MODELMULE_DB_PATH ?? DEFAULT_DB_PATH;
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(path);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        task_type TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage_daily (
        date TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        request_count INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        estimated_cost_usd REAL NOT NULL,
        error_count INTEGER NOT NULL,
        PRIMARY KEY (date, provider_id)
      );
      CREATE TABLE IF NOT EXISTS routing_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL,
        selected_provider_id TEXT,
        fallback_provider_id TEXT,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  upsertProvider(providerId: string, type: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO providers (id, type, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET type=excluded.type, updated_at=excluded.updated_at`
    ).run(providerId, type, now);
  }

  updateModels(providerId: string, models: string[]): void {
    const now = new Date().toISOString();
    const deleteStmt = this.db.prepare('DELETE FROM models WHERE provider_id = ?');
    const insertStmt = this.db.prepare('INSERT INTO models (provider_id, model, updated_at) VALUES (?, ?, ?)');
    const tx = this.db.transaction(() => {
      deleteStmt.run(providerId);
      for (const model of models) {
        insertStmt.run(providerId, model, now);
      }
    });
    tx();
  }

  logRequest(entry: RequestLog): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO requests
      (provider_id, model, task_type, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.providerId,
      entry.model,
      entry.taskType,
      entry.promptTokens,
      entry.completionTokens,
      entry.totalTokens,
      entry.estimatedCostUsd,
      entry.status,
      entry.errorMessage ?? null,
      now
    );

    const date = now.slice(0, 10);
    this.db.prepare(
      `INSERT INTO usage_daily (date, provider_id, request_count, total_tokens, estimated_cost_usd, error_count)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, provider_id) DO UPDATE SET
         request_count = usage_daily.request_count + excluded.request_count,
         total_tokens = usage_daily.total_tokens + excluded.total_tokens,
         estimated_cost_usd = usage_daily.estimated_cost_usd + excluded.estimated_cost_usd,
         error_count = usage_daily.error_count + excluded.error_count`
    ).run(
      date,
      entry.providerId,
      1,
      entry.totalTokens,
      entry.estimatedCostUsd,
      entry.status === 'error' ? 1 : 0
    );
  }

  logRoutingEvent(taskType: string, selectedProviderId?: string, fallbackProviderId?: string, reason?: string): void {
    this.db.prepare(
      'INSERT INTO routing_events (task_type, selected_provider_id, fallback_provider_id, reason, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(taskType, selectedProviderId ?? null, fallbackProviderId ?? null, reason ?? null, new Date().toISOString());
  }

  logError(providerId: string | undefined, message: string): void {
    this.db
      .prepare('INSERT INTO errors (provider_id, message, created_at) VALUES (?, ?, ?)')
      .run(providerId ?? null, message, new Date().toISOString());
  }

  getDailyProviderCost(providerId: string, date = new Date().toISOString().slice(0, 10)): number {
    const row = this.db
      .prepare('SELECT estimated_cost_usd as cost FROM usage_daily WHERE date = ? AND provider_id = ?')
      .get(date, providerId) as { cost?: number } | undefined;
    return row?.cost ?? 0;
  }

  getDailyProviderRequests(providerId: string, date = new Date().toISOString().slice(0, 10)): number {
    const row = this.db
      .prepare('SELECT request_count as count FROM usage_daily WHERE date = ? AND provider_id = ?')
      .get(date, providerId) as { count?: number } | undefined;
    return row?.count ?? 0;
  }

  usageSummary(date = new Date().toISOString().slice(0, 10)): {
    requestsToday: number;
    costTodayUsd: number;
    providerStatus: Array<{ providerId: string; requestCount: number; costUsd: number; errors: number }>;
    frequentModels: Array<{ model: string; count: number }>;
    fallbacks: number;
    errors: number;
  } {
    const totals = this.db
      .prepare('SELECT COALESCE(SUM(request_count), 0) as requests, COALESCE(SUM(estimated_cost_usd), 0) as cost FROM usage_daily WHERE date = ?')
      .get(date) as { requests: number; cost: number };

    const providerStatus = this.db
      .prepare('SELECT provider_id as providerId, request_count as requestCount, estimated_cost_usd as costUsd, error_count as errors FROM usage_daily WHERE date = ? ORDER BY request_count DESC')
      .all(date) as Array<{ providerId: string; requestCount: number; costUsd: number; errors: number }>;

    const frequentModels = this.db
      .prepare('SELECT model, COUNT(*) as count FROM requests WHERE DATE(created_at) = ? GROUP BY model ORDER BY count DESC LIMIT 5')
      .all(date) as Array<{ model: string; count: number }>;

    const fallbacks = this.db
      .prepare('SELECT COUNT(*) as count FROM routing_events WHERE DATE(created_at) = ? AND fallback_provider_id IS NOT NULL')
      .get(date) as { count: number };

    const errors = this.db
      .prepare('SELECT COUNT(*) as count FROM errors WHERE DATE(created_at) = ?')
      .get(date) as { count: number };

    return {
      requestsToday: totals.requests,
      costTodayUsd: Number(totals.cost.toFixed(6)),
      providerStatus,
      frequentModels,
      fallbacks: fallbacks.count,
      errors: errors.count
    };
  }
}

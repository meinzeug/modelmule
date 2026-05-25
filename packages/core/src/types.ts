import type { TaskType } from '@modelmule/config';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  taskType?: TaskType;
  metadata?: Record<string, unknown>;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  usage: ChatUsage;
  raw?: unknown;
}

export interface ProviderHealth {
  healthy: boolean;
  message?: string;
}

export interface ProviderRuntime {
  id: string;
  type: string;
  isLocal: boolean;
  priority: number;
  dailyBudgetUsd?: number;
  dailyRequestLimit?: number;
  listModels(): Promise<string[]>;
  healthCheck(): Promise<ProviderHealth>;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export interface RouteDecision {
  orderedProviders: string[];
  mode: string;
  taskType: TaskType;
}

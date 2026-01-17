/**
 * Типы для offline-first системы
 */

// Статус синхронизации сущности
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

// Типы операций для очереди синхронизации
export type OperationType = 'create' | 'update' | 'delete';

// Базовая сущность с метаданными синхронизации
export interface SyncableEntity {
  id: string;
  _localId?: string;        // Локальный ID (для новых сущностей)
  _syncStatus: SyncStatus;
  _lastModified: number;    // timestamp для разрешения конфликтов
  _serverVersion?: number;  // Версия на сервере (для оптимистичной блокировки)
}

// Заметка
export interface Note extends SyncableEntity {
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

// Сессия чата
export interface ChatSession extends SyncableEntity {
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Чеклист
export interface Checklist extends SyncableEntity {
  title: string;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order: number;
}

// Элемент очереди синхронизации
export interface SyncQueueItem {
  id: string;
  entityType: 'note' | 'checklist' | 'chat_session';
  entityId: string;
  operation: OperationType;
  payload: any;
  timestamp: number;
  retries: number;
  lastError?: string;
}

// Состояние сети
export interface NetworkState {
  isOnline: boolean;
  lastOnline: number | null;
  connectionType?: string;
}

// Состояние синхронизации
export interface SyncState {
  isSyncing: boolean;
  lastSyncAt: number | null;
  pendingCount: number;
  errorCount: number;
}

// Результат операции
export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  isOffline?: boolean;
}

// Конфликт данных
export interface DataConflict<T = any> {
  entityType: string;
  entityId: string;
  localVersion: T;
  serverVersion: T;
  localTimestamp: number;
  serverTimestamp: number;
}

// Стратегия разрешения конфликтов
export type ConflictResolution = 'local' | 'server' | 'merge' | 'manual';

// Настройки оффлайн-системы
export interface OfflineConfig {
  dbName: string;
  dbVersion: number;
  syncInterval: number;        // Интервал автосинхронизации (мс)
  maxRetries: number;          // Макс. попыток синхронизации
  conflictStrategy: ConflictResolution;
  enableAutoSync: boolean;
}

export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  dbName: 'nous_offline_v2',
  dbVersion: 1,
  syncInterval: 30000,         // 30 секунд
  maxRetries: 5,
  conflictStrategy: 'server',  // По умолчанию сервер приоритетнее
  enableAutoSync: true,
};

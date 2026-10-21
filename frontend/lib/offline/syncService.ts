/**
 * SyncService - сервис синхронизации данных
 * Отвечает за: очередь операций, синхронизацию с сервером, разрешение конфликтов
 */

import { database, STORE_NAMES, StoreName } from './database';
import {
  SyncQueueItem,
  SyncStatus,
  OperationType,
  OperationResult,
  Note,
  DEFAULT_OFFLINE_CONFIG,
} from './types';
// Только тип: checklistsRepository сам импортирует syncService
import type { DailyChecklist } from './checklistsRepository';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type EntityType = 'note' | 'checklist' | 'chat_session';

class SyncService {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private token: string | null = null;
  private listeners: Set<() => void> = new Set();

  /**
   * Установить токен авторизации
   */
  setToken(token: string | null): void {
    this.token = token;
  }

  /**
   * Подписаться на изменения состояния синхронизации
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Добавить операцию в очередь синхронизации
   */
  async enqueue(
    entityType: EntityType,
    entityId: string,
    operation: OperationType,
    payload: any
  ): Promise<void> {
    const item: SyncQueueItem = {
      id: `${entityType}_${entityId}_${Date.now()}`,
      entityType,
      entityId,
      operation,
      payload,
      timestamp: Date.now(),
      retries: 0,
    };

    await database.put(STORE_NAMES.SYNC_QUEUE, item);
    this.notifyListeners();

    // Пробуем синхронизировать сразу если онлайн
    if (this.isOnline()) {
      this.sync();
    }
  }

  /**
   * Дописать изменения в ещё не отправленное создание сущности.
   * Сущность с локальным id на сервере ещё не существует — отдельный
   * update по такому id сервер не найдёт.
   */
  async mergeIntoPendingCreate(entityType: EntityType, entityId: string, changes: object): Promise<boolean> {
    const queue = await this.getPendingOperations();
    const create = queue.find(
      (i) => i.entityType === entityType && i.entityId === entityId && i.operation === 'create'
    );
    if (!create) return false;
    await database.put(STORE_NAMES.SYNC_QUEUE, { ...create, payload: { ...create.payload, ...changes } });
    return true;
  }

  /**
   * Убрать из очереди все операции над сущностью (удалена до синхронизации)
   */
  async dropPending(entityType: EntityType, entityId: string): Promise<void> {
    const queue = await this.getPendingOperations();
    for (const item of queue) {
      if (item.entityType === entityType && item.entityId === entityId) {
        await database.delete(STORE_NAMES.SYNC_QUEUE, item.id);
      }
    }
    this.notifyListeners();
  }

  /**
   * Получить количество ожидающих операций
   */
  async getPendingCount(): Promise<number> {
    return database.count(STORE_NAMES.SYNC_QUEUE);
  }

  /**
   * Получить все ожидающие операции
   */
  async getPendingOperations(): Promise<SyncQueueItem[]> {
    const items = await database.getAll<SyncQueueItem>(STORE_NAMES.SYNC_QUEUE);
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Проверка онлайн-статуса
   */
  isOnline(): boolean {
    if (typeof window === 'undefined') return false;
    return navigator.onLine;
  }

  /**
   * Запустить автосинхронизацию
   */
  startAutoSync(interval = DEFAULT_OFFLINE_CONFIG.syncInterval): void {
    this.stopAutoSync();
    
    this.syncInterval = setInterval(() => {
      if (this.isOnline() && !this.isSyncing) {
        this.sync();
      }
    }, interval);

    // Слушаем восстановление сети
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }
  }

  /**
   * Остановить автосинхронизацию
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
  }

  private handleOnline = (): void => {
    // Небольшая задержка после восстановления сети
    setTimeout(() => this.sync(), 1000);
  };

  /**
   * Синхронизация всех ожидающих операций
   */
  async sync(): Promise<OperationResult> {
    if (this.isSyncing || !this.isOnline()) {
      return { success: false, error: 'Sync already in progress or offline' };
    }

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const queue = await this.getPendingOperations();
      
      if (queue.length === 0) {
        return { success: true };
      }

      let successCount = 0;
      let errorCount = 0;

      for (const item of queue) {
        try {
          const result = await this.processQueueItem(item);
          
          if (result.success) {
            // Удаляем из очереди при успехе
            await database.delete(STORE_NAMES.SYNC_QUEUE, item.id);
            successCount++;
          } else {
            // Увеличиваем счётчик попыток
            item.retries++;
            item.lastError = result.error;
            
            if (item.retries >= DEFAULT_OFFLINE_CONFIG.maxRetries) {
              // Слишком много попыток - удаляем и помечаем сущность как error
              await database.delete(STORE_NAMES.SYNC_QUEUE, item.id);
              await this.markEntityError(item.entityType, item.entityId, result.error);
              errorCount++;
            } else {
              await database.put(STORE_NAMES.SYNC_QUEUE, item);
            }
          }
        } catch (error) {
          console.error('[SyncService] Error processing queue item:', error);
          errorCount++;
        }
      }

      // Сохраняем время последней синхронизации
      await database.put(STORE_NAMES.METADATA, {
        key: 'lastSyncAt',
        value: Date.now(),
      });

      this.notifyListeners();

      return {
        success: errorCount === 0,
        data: { successCount, errorCount },
      };
    } catch (error) {
      console.error('[SyncService] Sync error:', error);
      return { success: false, error: String(error) };
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Обработка одного элемента очереди
   */
  private async processQueueItem(item: SyncQueueItem): Promise<OperationResult> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      switch (item.entityType) {
        case 'note':
          return this.syncNote(item, headers);
        case 'checklist':
          return this.syncChecklist(item, headers);
        case 'chat_session':
          return this.syncChatSession(item, headers);
        default:
          return { success: false, error: `Unknown entity type: ${item.entityType}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Синхронизация заметки
   */
  private async syncNote(item: SyncQueueItem, headers: HeadersInit): Promise<OperationResult> {
    const { operation, entityId, payload } = item;

    switch (operation) {
      case 'create': {
        const response = await fetch(`${API_URL}/api/notes`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }

        const serverNote = await response.json();
        
        // Обновляем локальную заметку с серверным ID
        const localNote = await database.get<Note>(STORE_NAMES.NOTES, entityId);
        if (localNote) {
          await database.delete(STORE_NAMES.NOTES, entityId);
        }
        
        await database.put(STORE_NAMES.NOTES, {
          ...serverNote,
          _syncStatus: 'synced' as SyncStatus,
          _lastModified: Date.now(),
        });

        return { success: true, data: serverNote };
      }

      case 'update': {
        const response = await fetch(`${API_URL}/api/notes/${entityId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }

        const serverNote = await response.json();
        
        await database.put(STORE_NAMES.NOTES, {
          ...serverNote,
          _syncStatus: 'synced' as SyncStatus,
          _lastModified: Date.now(),
        });

        return { success: true, data: serverNote };
      }

      case 'delete': {
        const response = await fetch(`${API_URL}/api/notes/${entityId}`, {
          method: 'DELETE',
          headers,
        });

        if (!response.ok && response.status !== 404) {
          return { success: false, error: `HTTP ${response.status}` };
        }

        // Удаляем локально
        await database.delete(STORE_NAMES.NOTES, entityId);

        return { success: true };
      }

      default:
        return { success: false, error: `Unknown operation: ${operation}` };
    }
  }

  /**
   * Синхронизация чеклиста: в payload всегда полное состояние дня,
   * а POST /api/checklists — upsert по дате, поэтому повтор безопасен
   */
  private async syncChecklist(item: SyncQueueItem, headers: HeadersInit): Promise<OperationResult> {
    const response = await fetch(`${API_URL}/api/checklists`, {
      method: 'POST',
      headers,
      body: JSON.stringify(item.payload),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const checklist = await database.get<DailyChecklist>(STORE_NAMES.CHECKLISTS, item.entityId);
    if (checklist) {
      await database.put(STORE_NAMES.CHECKLISTS, { ...checklist, _syncStatus: 'synced' as SyncStatus });
    }
    return { success: true };
  }

  /**
   * Синхронизация чат-сессии (заглушка)
   */
  private async syncChatSession(item: SyncQueueItem, headers: HeadersInit): Promise<OperationResult> {
    // Чат работает только онлайн и в очередь не попадает. Если попадёт —
    // пусть операция останется ошибкой, а не будет молча «синхронизирована»
    return { success: false, error: 'Chat sessions are not synced offline' };
  }

  /**
   * Пометить сущность как ошибочную
   */
  private async markEntityError(
    entityType: EntityType,
    entityId: string,
    error?: string
  ): Promise<void> {
    const storeName = this.getStoreName(entityType);
    const entity = await database.get<any>(storeName, entityId);
    
    if (entity) {
      entity._syncStatus = 'error';
      entity._syncError = error;
      await database.put(storeName, entity);
    }
  }

  private getStoreName(entityType: EntityType): StoreName {
    switch (entityType) {
      case 'note': return STORE_NAMES.NOTES;
      case 'checklist': return STORE_NAMES.CHECKLISTS;
      case 'chat_session': return STORE_NAMES.CHAT_SESSIONS;
    }
  }

  /**
   * Загрузить данные с сервера (полная синхронизация)
   */
  async pullFromServer(): Promise<OperationResult> {
    if (!this.isOnline() || !this.token) {
      return { success: false, isOffline: true };
    }

    try {
      const response = await fetch(`${API_URL}/api/notes`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const serverNotes = await response.json();

      // Получаем локальные pending заметки
      const localNotes = await database.getAll<Note>(STORE_NAMES.NOTES);
      const pendingNotes = localNotes.filter(n => n._syncStatus === 'pending');

      // Сохраняем серверные заметки
      for (const note of serverNotes) {
        // Не перезаписываем pending изменения
        const isPending = pendingNotes.some(p => p.id === note.id);
        if (!isPending) {
          await database.put(STORE_NAMES.NOTES, {
            ...note,
            _syncStatus: 'synced' as SyncStatus,
            _lastModified: Date.now(),
          });
        }
      }

      this.notifyListeners();
      return { success: true, data: serverNotes };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Получить статус синхронизации
   */
  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

export const syncService = new SyncService();

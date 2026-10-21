/**
 * IndexedDB Storage - низкоуровневый слой работы с БД
 * Абстракция над IndexedDB с промисами и типизацией
 */

import { DEFAULT_OFFLINE_CONFIG, OfflineConfig } from './types';

// Названия хранилищ
const STORES = {
  NOTES: 'notes',
  CHECKLISTS: 'checklists',
  CHAT_SESSIONS: 'chat_sessions',
  SYNC_QUEUE: 'sync_queue',
  METADATA: 'metadata',
} as const;

export type StoreName = typeof STORES[keyof typeof STORES];

class Database {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private config: OfflineConfig;

  constructor(config: OfflineConfig = DEFAULT_OFFLINE_CONFIG) {
    this.config = config;
  }

  /**
   * Проверка доступности IndexedDB
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  /**
   * Инициализация базы данных
   */
  async init(): Promise<boolean> {
    if (this.db) return true;
    if (this.initPromise) {
      await this.initPromise;
      return !!this.db;
    }

    if (!this.isAvailable()) {
      console.warn('[OfflineDB] IndexedDB not available');
      return false;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.dbVersion);

      request.onerror = () => {
        console.error('[OfflineDB] Failed to open database:', request.error);
        this.initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        
        // Обработка закрытия БД (например, при очистке браузера)
        this.db.onclose = () => {
          this.db = null;
          this.initPromise = null;
        };
        
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        this.createStores(db);
      };
    });

    try {
      await this.initPromise;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Создание хранилищ при обновлении схемы
   */
  private createStores(db: IDBDatabase): void {
    // Notes
    if (!db.objectStoreNames.contains(STORES.NOTES)) {
      const notesStore = db.createObjectStore(STORES.NOTES, { keyPath: 'id' });
      notesStore.createIndex('syncStatus', '_syncStatus', { unique: false });
      notesStore.createIndex('lastModified', '_lastModified', { unique: false });
      notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }

    // Checklists
    if (!db.objectStoreNames.contains(STORES.CHECKLISTS)) {
      const checklistsStore = db.createObjectStore(STORES.CHECKLISTS, { keyPath: 'id' });
      checklistsStore.createIndex('syncStatus', '_syncStatus', { unique: false });
      checklistsStore.createIndex('lastModified', '_lastModified', { unique: false });
    }

    // Chat Sessions
    if (!db.objectStoreNames.contains(STORES.CHAT_SESSIONS)) {
      const chatStore = db.createObjectStore(STORES.CHAT_SESSIONS, { keyPath: 'id' });
      chatStore.createIndex('syncStatus', '_syncStatus', { unique: false });
      chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }

    // Sync Queue
    if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
      const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
      queueStore.createIndex('timestamp', 'timestamp', { unique: false });
      queueStore.createIndex('entityType', 'entityType', { unique: false });
    }

    // Metadata (для хранения lastSyncAt и прочего)
    if (!db.objectStoreNames.contains(STORES.METADATA)) {
      db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
    }
  }

  /**
   * Получить одну запись
   */
  async get<T>(storeName: StoreName, id: string): Promise<T | null> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Получить все записи из хранилища
   */
  async getAll<T>(storeName: StoreName): Promise<T[]> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  /**
   * Получить записи по индексу
   */
  async getByIndex<T>(
    storeName: StoreName, 
    indexName: string, 
    value: IDBValidKey
  ): Promise<T[]> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  /**
   * Сохранить запись (создать или обновить)
   */
  async put<T>(storeName: StoreName, data: T): Promise<void> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) {
        throw new Error('Database not available');
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Сохранить несколько записей
   */
  async putMany<T>(storeName: StoreName, items: T[]): Promise<void> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) {
        throw new Error('Database not available');
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      for (const item of items) {
        store.put(item);
      }
    });
  }

  /**
   * Удалить запись
   */
  async delete(storeName: StoreName, id: string): Promise<void> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) {
        throw new Error('Database not available');
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Очистить хранилище
   */
  async clear(storeName: StoreName): Promise<void> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) {
        throw new Error('Database not available');
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Подсчёт записей
   */
  async count(storeName: StoreName, indexName?: string, value?: IDBValidKey): Promise<number> {
    if (!this.db) {
      const initialized = await this.init();
      if (!initialized || !this.db) return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      
      let request: IDBRequest<number>;
      if (indexName && value !== undefined) {
        const index = store.index(indexName);
        request = index.count(value);
      } else {
        request = store.count();
      }

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Закрыть соединение с БД
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  /**
   * Удалить базу данных полностью
   */
  async destroy(): Promise<void> {
    this.close();
    
    if (!this.isAvailable()) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.config.dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// Геттеры для хранилищ
export const STORE_NAMES = STORES;

// Синглтон базы данных
export const database = new Database();

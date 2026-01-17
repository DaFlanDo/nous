/**
 * ChecklistsRepository - репозиторий для работы с чеклистами
 * Работает по тому же принципу что и notesRepository
 */

import { database, STORE_NAMES } from './database';
import { syncService } from './syncService';
import { SyncStatus, OperationResult, ChecklistItem } from './types';

export interface DailyChecklist {
  id: string;  // id = date в формате yyyy-MM-dd
  date: string;
  items: ChecklistItem[];
  template_id?: string;
  // Offline sync fields
  _localId?: string;
  _syncStatus?: SyncStatus;
  _lastModified?: number;
  _version?: number;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: string[];
  // Offline sync fields
  _localId?: string;
  _syncStatus?: SyncStatus;
  _lastModified?: number;
}

// Re-export для удобства
export type { ChecklistItem } from './types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

class ChecklistsRepository {
  /**
   * Получить чеклист по дате
   */
  async getByDate(date: string): Promise<DailyChecklist | null> {
    try {
      return await database.get<DailyChecklist>(STORE_NAMES.CHECKLISTS, date);
    } catch {
      return null;
    }
  }

  /**
   * Получить все чеклисты
   */
  async getAll(): Promise<DailyChecklist[]> {
    try {
      return await database.getAll<DailyChecklist>(STORE_NAMES.CHECKLISTS);
    } catch {
      return [];
    }
  }

  /**
   * Сохранить чеклист (создать или обновить)
   */
  async save(date: string, items: ChecklistItem[], templateId?: string): Promise<OperationResult<DailyChecklist>> {
    try {
      const existing = await this.getByDate(date);
      
      const checklist: DailyChecklist = {
        id: date,
        date,
        items,
        template_id: templateId,
        _localId: existing?._localId || `local_${date}`,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
        _version: (existing?._version || 0) + 1,
      };

      await database.put(STORE_NAMES.CHECKLISTS, checklist);
      
      // Добавляем в очередь синхронизации
      await syncService.enqueue('checklist', date, existing ? 'update' : 'create', {
        date,
        items,
        template_id: templateId,
      });

      return { success: true, data: checklist };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Добавить элемент в чеклист
   */
  async addItem(date: string, text: string): Promise<OperationResult<DailyChecklist>> {
    const existing = await this.getByDate(date);
    const items = existing?.items || [];
    
    const newItem: ChecklistItem = {
      id: Date.now().toString(),
      text: text.trim(),
      completed: false,
      order: items.length,
    };

    return this.save(date, [...items, newItem], existing?.template_id);
  }

  /**
   * Переключить состояние элемента
   */
  async toggleItem(date: string, itemId: string): Promise<OperationResult<DailyChecklist>> {
    const existing = await this.getByDate(date);
    if (!existing) {
      return { success: false, error: 'Checklist not found' };
    }

    const items = existing.items.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );

    return this.save(date, items, existing.template_id);
  }

  /**
   * Удалить элемент из чеклиста
   */
  async removeItem(date: string, itemId: string): Promise<OperationResult<DailyChecklist>> {
    const existing = await this.getByDate(date);
    if (!existing) {
      return { success: false, error: 'Checklist not found' };
    }

    const items = existing.items.filter(item => item.id !== itemId);
    return this.save(date, items, existing.template_id);
  }

  /**
   * Применить шаблон к чеклисту
   */
  async applyTemplate(date: string, template: ChecklistTemplate): Promise<OperationResult<DailyChecklist>> {
    const existing = await this.getByDate(date);
    const existingItems = existing?.items || [];

    const newItems: ChecklistItem[] = template.items.map((text, index) => ({
      id: `${Date.now()}-${index}`,
      text,
      completed: false,
      order: existingItems.length + index,
    }));

    return this.save(date, [...existingItems, ...newItems], template.id);
  }

  /**
   * Сохранить чеклист с сервера
   */
  async saveFromServer(checklist: any): Promise<void> {
    const existing = await this.getByDate(checklist.date || checklist.id);
    
    // Не перезаписываем если есть локальные изменения
    if (existing && existing._syncStatus !== 'synced') {
      return;
    }

    const mapped: DailyChecklist = {
      id: checklist.date || checklist.id,
      date: checklist.date,
      items: checklist.items || [],
      template_id: checklist.template_id,
      _syncStatus: 'synced',
      _lastModified: Date.now(),
    };

    await database.put(STORE_NAMES.CHECKLISTS, mapped);
  }

  /**
   * Очистить локальные данные
   */
  async clearLocal(): Promise<void> {
    await database.clear(STORE_NAMES.CHECKLISTS);
  }
}

export const checklistsRepository = new ChecklistsRepository();

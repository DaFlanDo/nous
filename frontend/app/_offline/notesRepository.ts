/**
 * NotesRepository - репозиторий для работы с заметками
 * Инкапсулирует всю логику работы с заметками (локальные + синхронизация)
 */

import { database, STORE_NAMES } from './database';
import { syncService } from './syncService';
import { Note, SyncStatus, OperationResult } from './types';

class NotesRepository {
  /**
   * Получить все заметки
   */
  async getAll(): Promise<Note[]> {
    const notes = await database.getAll<Note>(STORE_NAMES.NOTES);
    
    // Фильтруем пустые и сортируем по дате
    return notes
      .filter(note => note.title?.trim() || note.content?.trim())
      .sort((a, b) => {
        const dateA = new Date(b.updatedAt || b.createdAt).getTime();
        const dateB = new Date(a.updatedAt || a.createdAt).getTime();
        return dateA - dateB;
      });
  }

  /**
   * Получить заметку по ID
   */
  async getById(id: string): Promise<Note | null> {
    return database.get<Note>(STORE_NAMES.NOTES, id);
  }

  /**
   * Получить несинхронизированные заметки
   */
  async getPending(): Promise<Note[]> {
    return database.getByIndex<Note>(STORE_NAMES.NOTES, 'syncStatus', 'pending');
  }

  /**
   * Создать заметку
   */
  async create(title: string, content: string): Promise<OperationResult<Note>> {
    const now = new Date().toISOString();
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const note: Note = {
      id: localId,
      _localId: localId,
      _syncStatus: 'pending',
      _lastModified: Date.now(),
      title,
      content,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await database.put(STORE_NAMES.NOTES, note);
      
      // Добавляем в очередь синхронизации
      await syncService.enqueue('note', localId, 'create', { title, content });

      return { success: true, data: note };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Обновить заметку
   */
  async update(id: string, updates: { title?: string; content?: string }): Promise<OperationResult<Note>> {
    try {
      const existing = await this.getById(id);
      
      if (!existing) {
        return { success: false, error: 'Note not found' };
      }

      const now = new Date().toISOString();
      const updatedNote: Note = {
        ...existing,
        ...updates,
        updatedAt: now,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      };

      await database.put(STORE_NAMES.NOTES, updatedNote);

      // Если заметка уже синхронизирована (имеет серверный ID)
      if (!id.startsWith('local_')) {
        await syncService.enqueue('note', id, 'update', updates);
      }
      // Если локальная - она уже в очереди на создание

      return { success: true, data: updatedNote };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Удалить заметку
   */
  async delete(id: string): Promise<OperationResult> {
    try {
      await database.delete(STORE_NAMES.NOTES, id);

      // Если это была синхронизированная заметка - добавляем удаление в очередь
      if (!id.startsWith('local_')) {
        await syncService.enqueue('note', id, 'delete', { id });
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Сохранить заметку (create или update в зависимости от наличия ID)
   */
  async save(id: string | null, title: string, content: string): Promise<OperationResult<Note>> {
    // Если пустая заметка - не сохраняем
    if (!title.trim() && !content.trim()) {
      return { success: false, error: 'Empty note' };
    }

    if (!id || id.startsWith('new_')) {
      // Новая заметка
      return this.create(title, content);
    } else {
      // Обновление существующей
      return this.update(id, { title, content });
    }
  }

  /**
   * Синхронизация с сервером (pull)
   */
  async syncFromServer(): Promise<OperationResult> {
    return syncService.pullFromServer();
  }

  /**
   * Очистить все локальные данные
   */
  async clearLocal(): Promise<void> {
    await database.clear(STORE_NAMES.NOTES);
  }

  /**
   * Сохранить заметки с сервера
   */
  async saveFromServer(notes: any[]): Promise<void> {
    for (const serverNote of notes) {
      // Проверяем нет ли локальных изменений
      const existing = await this.getById(serverNote.id);
      
      if (!existing || existing._syncStatus === 'synced') {
        // Маппим snake_case с сервера на camelCase
        const note: Note = {
          id: serverNote.id,
          title: serverNote.title,
          content: serverNote.content,
          createdAt: serverNote.created_at || serverNote.createdAt,
          updatedAt: serverNote.updated_at || serverNote.updatedAt,
          _syncStatus: 'synced' as SyncStatus,
          _lastModified: Date.now(),
        };
        await database.put(STORE_NAMES.NOTES, note);
      }
    }
  }
}

export const notesRepository = new NotesRepository();

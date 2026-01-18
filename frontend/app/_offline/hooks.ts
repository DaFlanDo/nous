/**
 * useOffline - хук для работы с offline-системой
 * Предоставляет: статус сети, синхронизации, методы работы с данными
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { database } from './database';
import { syncService } from './syncService';
import { notesRepository } from './notesRepository';
import { Note, SyncState, NetworkState } from './types';

interface UseOfflineOptions {
  token?: string | null;
  autoSync?: boolean;
}

interface UseOfflineReturn {
  // Состояние сети
  isOnline: boolean;
  // Состояние синхронизации
  isSyncing: boolean;
  pendingCount: number;
  // Методы
  sync: () => Promise<void>;
  // Статус инициализации
  isReady: boolean;
}

export function useOffline(options: UseOfflineOptions = {}): UseOfflineReturn {
  const { token = null, autoSync = true } = options;
  
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  const isInitialized = useRef(false);

  // Инициализация
  useEffect(() => {
    const init = async () => {
      if (isInitialized.current) return;
      isInitialized.current = true;

      // Инициализируем БД
      const dbReady = await database.init();
      
      if (dbReady) {
        // Устанавливаем токен
        syncService.setToken(token);
        
        // Обновляем счётчик
        const count = await syncService.getPendingCount();
        setPendingCount(count);
        
        // Запускаем автосинхронизацию
        if (autoSync) {
          syncService.startAutoSync();
        }
      }
      
      setIsReady(dbReady);
    };

    init();

    return () => {
      if (autoSync) {
        syncService.stopAutoSync();
      }
    };
  }, []);

  // Обновляем токен
  useEffect(() => {
    syncService.setToken(token);
  }, [token]);

  // Слушаем изменения сети
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Подписываемся на изменения syncService
  useEffect(() => {
    const unsubscribe = syncService.subscribe(async () => {
      setIsSyncing(syncService.getIsSyncing());
      const count = await syncService.getPendingCount();
      setPendingCount(count);
    });

    return unsubscribe;
  }, []);

  // Ручная синхронизация
  const sync = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    await syncService.sync();
  }, [isOnline, isSyncing]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    sync,
    isReady,
  };
}

/**
 * useNotes - хук для работы с заметками
 */
interface UseNotesOptions {
  token?: string | null;
}

interface UseNotesReturn {
  notes: Note[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createNote: (title: string, content: string) => Promise<Note | null>;
  updateNote: (id: string, title: string, content: string) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
  getNote: (id: string) => Promise<Note | null>;
}

export function useNotes(options: UseNotesOptions = {}): UseNotesReturn {
  const { token = null } = options;
  
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { isOnline } = useOffline({ token });

  // Передаём токен в репозиторий для синхронных операций
  useEffect(() => {
    notesRepository.setToken(token);
  }, [token]);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // Загрузка заметок - без проверки isReady, просто грузим
  const refresh = useCallback(async () => {
    console.log('[useNotes] Refresh called, token:', !!token, 'isOnline:', isOnline);
    
    setLoading(true);
    setError(null);

    try {
      // Сначала показываем локальные данные
      const localNotes = await notesRepository.getAll();
      console.log('[useNotes] Local notes:', localNotes.length);
      setNotes(localNotes);

      // Если онлайн - подтягиваем с сервера
      if (isOnline && token) {
        try {
          console.log('[useNotes] Fetching from server...');
          const response = await fetch(`${API_URL}/api/notes`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });

          if (response.ok) {
            const serverNotes = await response.json();
            console.log('[useNotes] Server notes:', serverNotes.length);
            await notesRepository.saveFromServer(serverNotes);
            
            // Обновляем список
            const updatedNotes = await notesRepository.getAll();
            console.log('[useNotes] Updated notes:', updatedNotes.length);
            setNotes(updatedNotes);
          }
        } catch (fetchError) {
          // Сервер недоступен - работаем с локальными данными
          console.warn('[useNotes] Server unavailable, using local data');
        }
      }
    } catch (err) {
      console.error('[useNotes] Error:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [isOnline, token]);

  // Убрали начальный refresh() - теперь это делает useFocusEffect в index.tsx

  // Создание заметки
  const createNote = useCallback(async (title: string, content: string): Promise<Note | null> => {
    const result = await notesRepository.create(title, content);
    
    if (result.success && result.data) {
      setNotes(prev => [result.data!, ...prev]);
      return result.data;
    }
    
    return null;
  }, []);

  // Обновление заметки
  const updateNote = useCallback(async (id: string, title: string, content: string): Promise<Note | null> => {
    const result = await notesRepository.update(id, { title, content });
    
    if (result.success && result.data) {
      setNotes(prev => prev.map(n => n.id === id ? result.data! : n));
      return result.data;
    }
    
    return null;
  }, []);

  // Удаление заметки
  const deleteNote = useCallback(async (id: string): Promise<boolean> => {
    // Оптимистичное удаление из UI
    setNotes(prev => prev.filter(n => n.id !== id));
    
    const result = await notesRepository.delete(id);
    
    if (!result.success) {
      // Откатываем если ошибка
      await refresh();
      return false;
    }
    
    return true;
  }, [refresh]);

  // Получение заметки
  const getNote = useCallback(async (id: string): Promise<Note | null> => {
    return notesRepository.getById(id);
  }, []);

  return {
    notes,
    loading,
    error,
    refresh,
    createNote,
    updateNote,
    deleteNote,
    getNote,
  };
}

/**
 * useChecklists - хук для работы с чеклистами
 */
import { checklistsRepository, DailyChecklist, ChecklistItem, ChecklistTemplate } from './checklistsRepository';

interface UseChecklistsOptions {
  token?: string | null;
  date: string;
}

interface UseChecklistsReturn {
  checklist: DailyChecklist | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (text: string) => Promise<boolean>;
  toggleItem: (itemId: string) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  applyTemplate: (template: ChecklistTemplate) => Promise<boolean>;
}

export function useChecklists(options: UseChecklistsOptions): UseChecklistsReturn {
  const { token = null, date } = options;
  
  const [checklist, setChecklist] = useState<DailyChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { isOnline, isReady } = useOffline({ token });

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  // Загрузка чеклиста
  const refresh = useCallback(async () => {
    if (!isReady) return;
    
    setLoading(true);
    setError(null);

    try {
      // Сначала показываем локальные данные
      const localChecklist = await checklistsRepository.getByDate(date);
      setChecklist(localChecklist);

      // Если онлайн - подтягиваем с сервера
      if (isOnline && token) {
        try {
          const response = await fetch(`${API_URL}/api/checklists/${date}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });

          if (response.ok) {
            const serverChecklist = await response.json();
            await checklistsRepository.saveFromServer(serverChecklist);
            
            // Обновляем из локального хранилища
            const updatedChecklist = await checklistsRepository.getByDate(date);
            setChecklist(updatedChecklist);
          }
        } catch (fetchError) {
          console.warn('[useChecklists] Server unavailable, using local data');
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [isReady, isOnline, token, date]);

  // Начальная загрузка
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Добавление элемента
  const addItem = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    
    const result = await checklistsRepository.addItem(date, text);
    
    if (result.success && result.data) {
      setChecklist(result.data);
      
      // Пробуем синхронизировать с сервером
      if (isOnline && token) {
        try {
          const response = await fetch(`${API_URL}/api/checklists`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              date,
              items: result.data.items,
            }),
          });
          
          if (response.ok) {
            const serverData = await response.json();
            await checklistsRepository.saveFromServer(serverData);
          }
        } catch {
          // Офлайн - данные уже сохранены локально
        }
      }
      
      return true;
    }
    
    return false;
  }, [date, isOnline, token]);

  // Переключение состояния
  const toggleItem = useCallback(async (itemId: string): Promise<boolean> => {
    const result = await checklistsRepository.toggleItem(date, itemId);
    
    if (result.success && result.data) {
      setChecklist(result.data);
      
      // Пробуем синхронизировать
      if (isOnline && token) {
        try {
          await fetch(`${API_URL}/api/checklists/${date}/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
          });
        } catch {
          // Офлайн
        }
      }
      
      return true;
    }
    
    return false;
  }, [date, isOnline, token]);

  // Удаление элемента
  const removeItem = useCallback(async (itemId: string): Promise<boolean> => {
    const result = await checklistsRepository.removeItem(date, itemId);
    
    if (result.success && result.data) {
      setChecklist(result.data);
      
      // Пробуем синхронизировать
      if (isOnline && token) {
        try {
          await fetch(`${API_URL}/api/checklists`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              date,
              items: result.data.items,
            }),
          });
        } catch {
          // Офлайн
        }
      }
      
      return true;
    }
    
    return false;
  }, [date, isOnline, token]);

  // Применение шаблона
  const applyTemplate = useCallback(async (template: ChecklistTemplate): Promise<boolean> => {
    const result = await checklistsRepository.applyTemplate(date, template);
    
    if (result.success && result.data) {
      setChecklist(result.data);
      
      // Пробуем синхронизировать
      if (isOnline && token) {
        try {
          await fetch(`${API_URL}/api/checklists`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              date,
              items: result.data.items,
              template_id: template.id,
            }),
          });
        } catch {
          // Офлайн
        }
      }
      
      return true;
    }
    
    return false;
  }, [date, isOnline, token]);

  return {
    checklist,
    loading,
    error,
    refresh,
    addItem,
    toggleItem,
    removeItem,
    applyTemplate,
  };
}

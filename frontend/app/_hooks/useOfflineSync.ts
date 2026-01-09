import { useState, useEffect, useCallback } from 'react';
import { offlineStorage, OfflineNote, SyncQueueItem } from '../_utils/offlineStorage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export function useOfflineSync(token: string | null = null) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Проверка сети (только для веб)
  useEffect(() => {
    if (typeof window === 'undefined' || !('navigator' in window)) return;

    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // Подсчет несинхронизированных заметок и операций в очереди
  const updateUnsyncedCount = useCallback(async () => {
    try {
      const unsynced = await offlineStorage.getUnsyncedNotes();
      const queue = await offlineStorage.getSyncQueue();
      setUnsyncedCount(unsynced.length + queue.length);
    } catch (error) {
      console.error('Error counting unsynced notes:', error);
    }
  }, []);

  useEffect(() => {
    updateUnsyncedCount();
  }, [updateUnsyncedCount]);

  // Синхронизация при восстановлении сети
  useEffect(() => {
    if (isOnline && unsyncedCount > 0 && token) {
      // Небольшая задержка чтобы дать время интерфейсу обновиться
      const timer = setTimeout(() => {
        syncNotes();
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, unsyncedCount, token]);

  const syncNotes = useCallback(async () => {
    if (isSyncing || !isOnline) return;

    setIsSyncing(true);
    try {
      // Синхронизируем несинхронизированные заметки
      const unsyncedNotes = await offlineStorage.getUnsyncedNotes();
      
      for (const note of unsyncedNotes) {
        try {
          // Проверяем, это новая заметка (offline_) или измененная существующая
          const isNewNote = note.id.startsWith('offline_');
          const method = isNewNote ? 'POST' : 'PUT';
          const url = isNewNote 
            ? `${API_URL}/api/notes` 
            : `${API_URL}/api/notes/${note.id}`;
          
          // Отправляем на сервер
          const response = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              title: note.title,
              content: note.content,
            }),
          });

          if (response.ok) {
            const serverNote = await response.json();
            
            // Удаляем старую офлайн-заметку если это была новая
            if (isNewNote) {
              await offlineStorage.deleteNote(note.id);
            }
            
            // Сохраняем с новым или обновленным ID с сервера
            await offlineStorage.saveNote({
              ...serverNote,
              synced: true,
            });
          }
        } catch (error) {
          console.error('Error syncing note:', error);
        }
      }

      // Обрабатываем очередь синхронизации (удаления и другие операции)
      const syncQueue = await offlineStorage.getSyncQueue();
      
      for (const item of syncQueue) {
        try {
          if (item.type === 'delete') {
            // Удаляем заметку с сервера
            const response = await fetch(`${API_URL}/api/notes/${item.data.noteId}`, {
              method: 'DELETE',
              headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
              },
            });

            if (response.ok) {
              // Удаляем из очереди если успешно
              await offlineStorage.removeSyncQueueItem(item.id);
            } else {
              // Увеличиваем счетчик попыток
              item.retries += 1;
              if (item.retries > 5) {
                // Слишком много попыток - удаляем из очереди
                await offlineStorage.removeSyncQueueItem(item.id);
              } else {
                await offlineStorage.addToSyncQueue(item);
              }
            }
          }
        } catch (error) {
          console.error('Error processing sync queue item:', error);
          // Увеличиваем счетчик попыток при ошибке
          item.retries += 1;
          if (item.retries <= 5) {
            await offlineStorage.addToSyncQueue(item);
          } else {
            await offlineStorage.removeSyncQueueItem(item.id);
          }
        }
      }

      await updateUnsyncedCount();
      
      // Возвращаем true если синхронизация прошла успешно
      return true;
    } catch (error) {
      console.error('Error during sync:', error);
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, token, updateUnsyncedCount]);

  return {
    isOnline,
    isSyncing,
    unsyncedCount,
    syncNotes,
    updateUnsyncedCount,
  };
}

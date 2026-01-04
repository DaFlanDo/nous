import { useState, useEffect, useCallback } from 'react';
import { offlineStorage, OfflineNote, SyncQueueItem } from '../utils/offlineStorage';

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

  // Подсчет несинхронизированных заметок
  const updateUnsyncedCount = useCallback(async () => {
    try {
      const unsynced = await offlineStorage.getUnsyncedNotes();
      setUnsyncedCount(unsynced.length);
    } catch (error) {
      console.error('Error counting unsynced notes:', error);
    }
  }, []);

  useEffect(() => {
    updateUnsyncedCount();
  }, [updateUnsyncedCount]);

  // Синхронизация при восстановлении сети
  useEffect(() => {
    if (isOnline && unsyncedCount > 0) {
      syncNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, unsyncedCount]);

  const syncNotes = useCallback(async () => {
    if (isSyncing || !isOnline) return;

    setIsSyncing(true);
    try {
      const unsyncedNotes = await offlineStorage.getUnsyncedNotes();
      
      for (const note of unsyncedNotes) {
        try {
          // Отправляем на сервер
          const response = await fetch(`${API_URL}/api/notes`, {
            method: 'POST',
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
            
            // Удаляем старую офлайн-заметку
            if (note.id.startsWith('offline_')) {
              await offlineStorage.deleteNote(note.id);
            }
            
            // Сохраняем с новым ID с сервера
            await offlineStorage.saveNote({
              ...serverNote,
              synced: true,
            });
          }
        } catch (error) {
          console.error('Error syncing note:', error);
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
  }, [isSyncing, isOnline, updateUnsyncedCount]);

  return {
    isOnline,
    isSyncing,
    unsyncedCount,
    syncNotes,
    updateUnsyncedCount,
  };
}

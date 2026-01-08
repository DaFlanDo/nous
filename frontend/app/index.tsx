import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuthContext } from './_layout';
import { offlineStorage } from './_utils/offlineStorage';
import { useOfflineSync } from './_hooks/useOfflineSync';
import { useTheme } from './theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function NotesScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { user, token, signOut } = useAuthContext();
  const { isOnline, isSyncing, unsyncedCount, syncNotes, updateUnsyncedCount } = useOfflineSync(token);
  const router = useRouter();

  const fetchNotes = useCallback(async () => {
    try {
      // Не загружаем с сервера, если нет токена
      if (!token) {
        // Только локальные заметки
        if (typeof window !== 'undefined') {
          const localNotes = await offlineStorage.getAllNotes();
          setNotes(localNotes as any);
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Сначала загружаем локальные заметки
      const localNotes = typeof window !== 'undefined' 
        ? await offlineStorage.getAllNotes()
        : [];

      // Если офлайн, показываем только локальные
      if (typeof window !== 'undefined' && !navigator.onLine) {
        setNotes(localNotes as any);
        return;
      }

      // Онлайн - пытаемся загрузить с сервера
      const response = await fetch(`${API_URL}/api/notes`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const serverNotes = await response.json();
        
        // Сохраняем серверные заметки в IndexedDB
        if (typeof window !== 'undefined') {
          for (const note of serverNotes) {
            await offlineStorage.saveNote({
              ...note,
              synced: true,
            });
          }
        }

        // Объединяем серверные и несинхронизированные локальные заметки
        const unsyncedLocalNotes = localNotes.filter((note: any) => 
          !note.synced && note.id.startsWith('offline_')
        );
        
        // Создаём Map для удаления дубликатов
        const notesMap = new Map();
        [...serverNotes, ...unsyncedLocalNotes].forEach((note: any) => {
          notesMap.set(note.id, note);
        });
        
        setNotes(Array.from(notesMap.values()));
      } else {
        // Если сервер недоступен, показываем локальные заметки
        setNotes(localNotes as any);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
      
      // При ошибке сети - загружаем из IndexedDB
      if (typeof window !== 'undefined') {
        const offlineNotes = await offlineStorage.getAllNotes();
        setNotes(offlineNotes as any);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    // Инициализация офлайн-хранилища и загрузка заметок
    const initAndFetch = async () => {
      if (typeof window !== 'undefined') {
        try {
          await offlineStorage.init();
        } catch (error) {
          console.error('Error initializing offline storage:', error);
        }
      }
      fetchNotes();
    };
    
    initAndFetch();
  }, [fetchNotes]);

  // Обновляем список заметок при возврате на экран
  useFocusEffect(
    useCallback(() => {
      fetchNotes();
    }, [fetchNotes])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotes();
  };

  const openNewNote = () => {
    // Просто переходим в редактор с новым временным ID
    // Заметка будет создана только при сохранении с содержимым
    const newNoteId = `new_${Date.now()}`;
    router.push({
      pathname: '/note-edit',
      params: { id: newNoteId, isNew: 'true' }
    });
  };

  const openEditNote = (note: Note) => {
    router.push({
      pathname: '/note-edit',
      params: { id: note.id }
    });
  };

  const deleteNote = async (noteId: string) => {
    try {
      await fetch(`${API_URL}/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      fetchNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const filteredNotes = notes.filter(
    note =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  const handleProfilePress = () => {
    router.push('/profile');
  };

  const renderNote = ({ item, index }: { item: Note; index: number }) => (
    <TouchableOpacity 
      style={[
        styles.noteCard, 
        { 
          backgroundColor: colors.cardBackground,
          shadowColor: isDark ? '#000' : '#8B7355',
          shadowOpacity: isDark ? 0.4 : 0.06,
        }, 
        index === 0 && styles.firstCard
      ]} 
      onPress={() => openEditNote(item)}
      activeOpacity={0.7}
    >
      <View style={styles.noteContent}>
        <Text style={[styles.noteTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.noteText, { color: colors.textSecondary }]} numberOfLines={2}>{item.content}</Text>
        <Text style={[styles.noteDate, { color: colors.textSecondary }]}>
          {format(new Date(item.updated_at), 'd MMMM', { locale: ru })}
        </Text>
      </View>
      <TouchableOpacity 
        style={styles.deleteBtn}
        onPress={() => deleteNote(item.id)} 
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (confirm('Выйти из аккаунта?')) {
        signOut();
      }
    } else {
      Alert.alert(
        'Выход',
        'Выйти из аккаунта?',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Выйти', style: 'destructive', onPress: signOut },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{getGreeting()}</Text>
            <View style={styles.brandRow}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Nous</Text>
              <Text style={[styles.greekAccent, { color: colors.primary }]}>νοῦς</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.profileBtn} onPress={handleProfilePress}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.profileImage} />
            ) : (
              <View style={[styles.profilePlaceholder, { backgroundColor: colors.surface }]}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>пространство для мыслей</Text>
        
        {/* Индикатор офлайн и несинхронизированных заметок */}
        {(!isOnline || unsyncedCount > 0) && (
          <View style={styles.statusBar}>
            {!isOnline && (
              <View style={styles.offlineIndicator}>
                <Ionicons name="cloud-offline" size={14} color="#FF6B6B" />
                <Text style={styles.offlineText}>Офлайн</Text>
              </View>
            )}
            {unsyncedCount > 0 && (
              <TouchableOpacity 
                style={styles.syncIndicator} 
                onPress={async () => {
                  const success = await syncNotes();
                  if (success) {
                    // После успешной синхронизации обновляем список заметок
                    fetchNotes();
                  }
                }}
                disabled={!isOnline || isSyncing}
              >
                <Ionicons 
                  name={isSyncing ? "sync" : "cloud-upload-outline"} 
                  size={14} 
                  color="#8B7355" 
                />
                <Text style={styles.syncText}>
                  {isSyncing ? 'Синхронизация...' : `${unsyncedCount} не синхр.`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Найти запись..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredNotes}
        renderItem={renderNote}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#8B7355"
            colors={['#8B7355']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="leaf-outline" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.emptyText, { color: colors.text }]}>Пока пусто</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Начните записывать свои мысли{"\n"}и наблюдения
            </Text>
          </View>
        }
      />

      <TouchableOpacity 
        style={[
          styles.fab, 
          { 
            backgroundColor: colors.primary,
            shadowColor: isDark ? '#000' : colors.primary,
            shadowOpacity: isDark ? 0.5 : 0.3,
          }
        ]} 
        onPress={openNewNote} 
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  profileBtn: {
    padding: 4,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  profilePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 14,
    color: '#A89F91',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '300',
    color: '#5D4E3A',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  greekAccent: {
    fontSize: 18,
    color: '#C4B8A8',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#A89F91',
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'lowercase',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  offlineText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EBE3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  syncText: {
    fontSize: 12,
    color: '#8B7355',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EBE3',
    marginHorizontal: 24,
    marginVertical: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#5D4E3A',
    fontSize: 15,
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingBottom: 140,
  },
  noteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  firstCard: {
    marginTop: 4,
  },
  noteContent: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  noteText: {
    fontSize: 14,
    color: '#8B7355',
    lineHeight: 20,
    marginBottom: 12,
  },
  noteDate: {
    fontSize: 12,
    color: '#C4B8A8',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#8B7355',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#A89F91',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 120,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#8B7355',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
});

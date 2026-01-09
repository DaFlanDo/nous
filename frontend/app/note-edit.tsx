import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuthContext } from './_layout';
import { offlineStorage, OfflineNote } from './_utils/offlineStorage';
import { useOfflineSync } from './_hooks/useOfflineSync';
import { useTheme } from './theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Компонент линованной бумаги (только для светлой темы)
const PaperLines = ({ lineCount = 30, isDark = false, showLines = true }: { lineCount?: number; isDark?: boolean; showLines?: boolean }) => {
  if (isDark || !showLines) return null;
  
  return (
    <View style={paperStyles.linesContainer} pointerEvents="none">
      {Array.from({ length: lineCount }).map((_, index) => (
        <View key={index} style={paperStyles.line} />
      ))}
    </View>
  );
};

const paperStyles = StyleSheet.create({
  linesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 0,
  },
  line: {
    height: 32,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 185, 165, 0.3)',
    marginHorizontal: 20,
  },
});

export default function NoteEditScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token } = useAuthContext();
  const { isOnline, updateUnsyncedCount } = useOfflineSync(token);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contentHeight, setContentHeight] = useState(100);
  const lastHeight = useRef(100);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialContent = useRef({ title: '', content: '' });

  const noteId = params.id as string;
  const isNew = params.isNew === 'true';

  // Загрузка заметки или очистка для новой
  useEffect(() => {
    if (isNew) {
      // Новая заметка - очищаем поля
      setTitle('');
      setContent('');
      setContentHeight(100);
      lastHeight.current = 100;
      initialContent.current = { title: '', content: '' };
      setHasUnsavedChanges(false);
    } else if (noteId) {
      // Существующая заметка - загружаем
      loadNote(noteId);
    }
  }, [noteId, isNew]);

  // Автосохранение в IndexedDB при изменении (только для существующих заметок)
  useEffect(() => {
    if (isNew) return; // Не автосохраняем новые заметки
    
    const timer = setTimeout(() => {
      if (title || content) {
        offlineStorage.saveNote({
          id: noteId,
          title,
          content,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          synced: false,
        }).catch(error => {
          console.error('Error auto-saving:', error);
        });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [title, content, noteId, isNew]);

  // Отслеживание несохранённых изменений
  useEffect(() => {
    const hasChanges = 
      title !== initialContent.current.title || 
      content !== initialContent.current.content;
    setHasUnsavedChanges(hasChanges);
  }, [title, content]);

  const handleBack = () => {
    // Если это новая заметка и есть содержимое - предлагаем сохранить
    if (isNew && (title.trim() || content.trim())) {
      Alert.alert(
        'Сохранить заметку?',
        'Хотите сохранить эту заметку?',
        [
          {
            text: 'Отмена',
            style: 'cancel',
          },
          {
            text: 'Не сохранять',
            style: 'destructive',
            onPress: () => router.back(),
          },
          {
            text: 'Сохранить',
            onPress: saveNote,
          },
        ]
      );
    } else if (!isNew && hasUnsavedChanges && (title.trim() || content.trim())) {
      Alert.alert(
        'Несохранённые изменения',
        'У вас есть несохранённые изменения. Сохранить перед выходом?',
        [
          {
            text: 'Отмена',
            style: 'cancel',
          },
          {
            text: 'Выйти без сохранения',
            style: 'destructive',
            onPress: async () => {
              // Удаляем пустую заметку если ничего не было сохранено
              if (!initialContent.current.title && !initialContent.current.content) {
                try {
                  if (typeof window !== 'undefined') {
                    await offlineStorage.deleteNote(noteId);
                    await updateUnsyncedCount();
                  }
                } catch (error) {
                  console.error('Error deleting note:', error);
                }
              }
              router.back();
            },
          },
          {
            text: 'Сохранить',
            onPress: saveNote,
          },
        ]
      );
    } else {
      // Если изменений нет или это пустая новая заметка - просто выходим
      const shouldDelete = (isNew || noteId.startsWith('new_')) && !title.trim() && !content.trim();
      if (shouldDelete || (!isNew && !title.trim() && !content.trim())) {
        if (typeof window !== 'undefined') {
          offlineStorage.deleteNote(noteId).catch(console.error);
          updateUnsyncedCount().catch(console.error);
        }
      }
      router.back();
    }
  };

  const loadNote = async (id: string) => {
    setLoading(true);
    try {
      // Загружаем из локального хранилища
      const localNote = await offlineStorage.getNote(id);
      if (localNote) {
        setTitle(localNote.title);
        setContent(localNote.content);
        initialContent.current = { title: localNote.title, content: localNote.content };
        const initialHeight = Math.max(100, localNote.content.split('\n').length * 32);
        setContentHeight(initialHeight);
        lastHeight.current = initialHeight;
      }

      // Если онлайн, пробуем обновить с сервера (только для синхронизированных заметок)
      if (isOnline && token && !id.startsWith('offline_')) {
        const response = await fetch(`${API_URL}/api/notes/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const note = await response.json();
          setTitle(note.title);
          setContent(note.content);
          initialContent.current = { title: note.title, content: note.content };
          const initialHeight = Math.max(100, note.content.split('\n').length * 32);
          setContentHeight(initialHeight);
          lastHeight.current = initialHeight;
        }
      }
    } catch (error) {
      console.error('Error loading note:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContentSizeChange = useCallback((e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const newHeight = e.nativeEvent.contentSize.height;
    if (Math.abs(newHeight - lastHeight.current) > 5) {
      lastHeight.current = newHeight;
      setContentHeight(newHeight);
    }
  }, []);

  const insertCurrentTime = () => {
    const now = format(new Date(), 'HH:mm:ss, dd MMMM', { locale: ru });
    const timeStamp = `\n━━━  ${now}  ━━━\n`;
    setContent(prev => {
      const newContent = prev + timeStamp;
      // Принудительно обновляем высоту
      setTimeout(() => {
        const lines = newContent.split('\n').length;
        const newHeight = Math.max(100, lines * 32);
        setContentHeight(newHeight);
        lastHeight.current = newHeight;
      }, 0);
      return newContent;
    });
  };

  const saveNote = async () => {
    if (!title.trim() && !content.trim()) {
      // Если заметка пустая, просто выходим без сохранения
      router.back();
      return;
    }

    setSaving(true);

    try {
      if (isOnline && token) {
        // Онлайн - отправляем на сервер
        if (isNew || noteId.startsWith('new_') || noteId.startsWith('offline_')) {
          // Новая заметка - создаём на сервере
          const response = await fetch(`${API_URL}/api/notes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ title, content }),
          });
          if (response.ok) {
            const serverNote = await response.json();
            // Удаляем старую временную/офлайн версию если была
            if (typeof window !== 'undefined' && noteId.startsWith('offline_')) {
              await offlineStorage.deleteNote(noteId);
            }
            // Сохраняем серверную версию
            if (typeof window !== 'undefined') {
              await offlineStorage.saveNote({
                ...serverNote,
                synced: true,
              });
            }
            router.back();
          }
        } else {
          // Существующая заметка - обновляем
          const response = await fetch(`${API_URL}/api/notes/${noteId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ title, content }),
          });
          if (response.ok) {
            const updatedNote = await response.json();
            if (typeof window !== 'undefined') {
              await offlineStorage.saveNote({
                ...updatedNote,
                synced: true,
              });
            }
            router.back();
          }
        }
      } else {
        // Офлайн - сохраняем локально
        const isNewNote = isNew || noteId.startsWith('new_') || noteId.startsWith('offline_');
        const offlineNote: OfflineNote = {
          id: isNewNote ? `offline_${Date.now()}` : noteId,
          title,
          content,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          synced: false,
        };
        
        if (typeof window !== 'undefined') {
          // Если обновляем существующую заметку, удаляем старую временную версию
          if (isNewNote && noteId) {
            await offlineStorage.deleteNote(noteId);
          }
          await offlineStorage.saveNote(offlineNote);
          await updateUnsyncedCount();
        }
        router.back();
      }
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#1a1a1a' : colors.background }]} edges={['top']}>
      {/* Хедер */}
      <View style={[
        styles.header, 
        { 
          backgroundColor: isDark ? '#1a1a1a' : colors.background, 
          borderBottomColor: isDark ? 'rgba(197, 165, 114, 0.12)' : colors.border,
        }
      ]}>
        <TouchableOpacity 
          onPress={handleBack}
          style={styles.closeBtn}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={isDark ? '#a1a1aa' : colors.text} 
          />
        </TouchableOpacity>
        
        <Text style={[
          styles.headerTitle,
          { color: isDark ? '#E8CFA0' : colors.text }
        ]}>
          {title || 'Новая запись'}
        </Text>
        
        <TouchableOpacity 
          onPress={saveNote} 
          disabled={saving || !title.trim()}
          style={[
            styles.saveBtn,
            isDark && styles.saveBtnDark,
            (!title.trim() || saving) && styles.saveBtnDisabled,
            isDark && (!title.trim() || saving) && styles.saveBtnDisabledDark,
          ]}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color={isDark ? '#1a1a1a' : '#fff'} />
          ) : (
            <Text style={[
              styles.saveBtnText,
              { color: isDark ? '#1a1a1a' : '#fff' },
              (!title.trim() || saving) && { color: isDark ? 'rgba(26, 26, 26, 0.5)' : 'rgba(255, 255, 255, 0.7)' },
            ]}>
              Сохранить
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView 
          style={[
            styles.paperContainer, 
            { backgroundColor: isDark ? '#1a1a1a' : colors.background }
          ]}
          contentContainerStyle={styles.paperContentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Эффект текстуры бумаги - только для светлой темы */}
          {!isDark && (
            <View style={styles.paperBackground}>
              <View style={[styles.marginLine, { backgroundColor: 'rgba(220, 140, 140, 0.4)' }]} />
              <PaperLines lineCount={50} isDark={isDark} />
            </View>
          )}
          
          {/* Область ввода */}
          <View style={[
            styles.noteContentArea,
            isDark && styles.noteContentAreaDark
          ]}>
            <TextInput
              style={[
                styles.titleInput, 
                { 
                  color: isDark ? '#F4F4F5' : colors.text,
                }
              ]}
              placeholder="О чём вы думаете?"
              placeholderTextColor={isDark ? 'rgba(161, 161, 170, 0.6)' : colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              autoFocus={!title && !content}
            />

            <TouchableOpacity 
              style={[
                styles.timeBtn, 
                isDark ? styles.timeBtnDark : {},
                { 
                  backgroundColor: isDark ? 'rgba(197, 165, 114, 0.12)' : 'rgba(139, 115, 85, 0.1)',
                  borderColor: isDark ? 'rgba(197, 165, 114, 0.3)' : 'transparent',
                  borderWidth: isDark ? 1 : 0,
                }
              ]} 
              onPress={insertCurrentTime}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="time-outline" 
                size={16} 
                color={isDark ? '#E8CFA0' : colors.primary} 
              />
              <Text style={[
                styles.timeBtnText, 
                { color: isDark ? '#E8CFA0' : colors.primary }
              ]}>
                Добавить время
              </Text>
            </TouchableOpacity>

            <TextInput
              style={[
                styles.contentInput, 
                { 
                  height: Math.max(100, contentHeight), 
                  color: isDark ? '#E4E4E7' : colors.text,
                }
              ]}
              placeholder="Запишите свои мысли, чувства, наблюдения..."
              placeholderTextColor={isDark ? 'rgba(161, 161, 170, 0.5)' : colors.textSecondary}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
              onContentSizeChange={handleContentSizeChange}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E2D9',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  saveBtn: {
    backgroundColor: '#8B7355',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  saveBtnDark: {
    backgroundColor: '#D4B989',
    shadowColor: '#D4B989',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  saveBtnDisabled: {
    backgroundColor: '#C4B8A8',
    opacity: 0.5,
  },
  saveBtnDisabledDark: {
    backgroundColor: 'rgba(197, 165, 114, 0.25)',
    shadowOpacity: 0,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  paperContainer: {
    flex: 1,
    backgroundColor: '#FFFEF9',
  },
  paperContentContainer: {
    minHeight: '100%',
    paddingBottom: 100,
  },
  paperBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  marginLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 44,
    width: 1,
    backgroundColor: 'rgba(220, 140, 140, 0.4)',
  },
  noteContentArea: {
    paddingLeft: 52,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  noteContentAreaDark: {
    paddingLeft: 20,
    paddingTop: 20,
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(197, 165, 114, 0.15)',
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '500',
    color: '#4A4136',
    paddingBottom: 8,
    letterSpacing: -0.3,
    lineHeight: 32,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    // @ts-ignore - web only property
    outlineWidth: 0,
  },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(139, 115, 85, 0.1)',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  timeBtnDark: {
    shadowColor: '#C5A572',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  timeBtnText: {
    color: '#8B7355',
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '600',
  },
  contentInput: {
    fontSize: 17,
    color: '#4A4136',
    lineHeight: 32,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    // @ts-ignore - web only property
    outlineWidth: 0,
  },
});

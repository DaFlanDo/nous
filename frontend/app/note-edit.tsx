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
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuthContext } from './_layout';
import { notesRepository, useOffline } from './_offline';
import { useTheme } from './theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const DRAFT_KEY = 'nous_note_draft';
const AUTOSAVE_INTERVAL = 1500; // Автосохранение каждые 1.5 секунды (быстрее для iOS)

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
  const { isOnline } = useOffline({ token });

  // Передаём токен в репозиторий для синхронного сохранения на сервер
  useEffect(() => {
    notesRepository.setToken(token);
  }, [token]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contentHeight, setContentHeight] = useState(100);
  const lastHeight = useRef(100);
  const scrollViewRef = useRef<ScrollView>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialContent = useRef({ title: '', content: '' });

  const noteId = params.id as string;
  const isNew = params.isNew === 'true';
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraft = useRef({ title: '', content: '' });

  // === АВТОСОХРАНЕНИЕ ЧЕРНОВИКА ===
  
  // Сохранение черновика в AsyncStorage
  const saveDraft = useCallback(async (draftTitle: string, draftContent: string) => {
    // Не сохраняем если ничего нет или не изменилось
    if (!draftTitle && !draftContent) return;
    if (draftTitle === lastSavedDraft.current.title && draftContent === lastSavedDraft.current.content) return;
    
    const draft = {
      noteId: noteId || 'new',
      title: draftTitle,
      content: draftContent,
      savedAt: Date.now(),
    };
    
    try {
      // Сохраняем в оба хранилища для надёжности
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      
      // Дополнительно в localStorage (синхронно, выживает при краше iOS Safari)
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
      
      lastSavedDraft.current = { title: draftTitle, content: draftContent };
      console.log('[Draft] Saved at', new Date().toLocaleTimeString());
    } catch (e) {
      console.error('[Draft] Save error:', e);
      // Fallback: хотя бы в localStorage
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {}
      }
    }
  }, [noteId]);

  // Загрузка черновика (проверяем оба хранилища)
  const loadDraft = useCallback(async () => {
    try {
      let draftJson = await AsyncStorage.getItem(DRAFT_KEY);
      
      // Fallback: проверяем localStorage (может быть более свежий)
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const localDraft = localStorage.getItem(DRAFT_KEY);
        if (localDraft) {
          const localParsed = JSON.parse(localDraft);
          const asyncParsed = draftJson ? JSON.parse(draftJson) : null;
          
          // Берём более свежий черновик
          if (!asyncParsed || localParsed.savedAt > asyncParsed.savedAt) {
            draftJson = localDraft;
          }
        }
      }
      
      if (!draftJson) return null;
      
      const draft = JSON.parse(draftJson);
      // Черновик актуален если моложе 24 часов и для той же заметки (или новой)
      const isRecent = Date.now() - draft.savedAt < 24 * 60 * 60 * 1000;
      const isSameNote = draft.noteId === (noteId || 'new') || draft.noteId.startsWith('new');
      
      if (isRecent && isSameNote && (draft.title || draft.content)) {
        return draft;
      }
      return null;
    } catch (e) {
      // Последняя попытка - только localStorage
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        try {
          const localDraft = localStorage.getItem(DRAFT_KEY);
          if (localDraft) {
            return JSON.parse(localDraft);
          }
        } catch {}
      }
      return null;
    }
  }, [noteId]);

  // Очистка черновика после успешного сохранения
  const clearDraft = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
      // Также очищаем localStorage
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.removeItem(DRAFT_KEY);
      }
      lastSavedDraft.current = { title: '', content: '' };
    } catch (e) {
      console.error('[Draft] Clear error:', e);
    }
  }, []);

  // Автосохранение при изменении текста
  useEffect(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }
    
    autosaveTimer.current = setTimeout(() => {
      saveDraft(title, content);
    }, AUTOSAVE_INTERVAL);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [title, content, saveDraft]);

  // Сохранение при сворачивании приложения
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        saveDraft(title, content);
      }
    });

    return () => subscription.remove();
  }, [title, content, saveDraft]);

  // Сохранение при закрытии страницы (web) - максимальная защита для iOS Safari
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const saveImmediately = () => {
      if (title || content) {
        const draft = JSON.stringify({
          noteId: noteId || 'new',
          title,
          content,
          savedAt: Date.now(),
        });
        try {
          localStorage.setItem(DRAFT_KEY, draft);
          console.log('[Draft] Emergency save on visibility change');
        } catch {}
      }
    };

    // Множественные события для максимальной защиты на iOS
    window.addEventListener('beforeunload', saveImmediately);
    window.addEventListener('pagehide', saveImmediately); // iOS Safari
    window.addEventListener('freeze', saveImmediately);   // Page Lifecycle API
    
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveImmediately();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Сохраняем при потере фокуса (переключение на другую вкладку/приложение)
    window.addEventListener('blur', saveImmediately);

    return () => {
      window.removeEventListener('beforeunload', saveImmediately);
      window.removeEventListener('pagehide', saveImmediately);
      window.removeEventListener('freeze', saveImmediately);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', saveImmediately);
    };
  }, [title, content, noteId]);

  // === ЗАГРУЗКА ЗАМЕТКИ / ЧЕРНОВИКА ===

  // Загрузка заметки или очистка для новой
  useEffect(() => {
    const initNote = async () => {
      // Сначала проверяем есть ли несохранённый черновик
      const draft = await loadDraft();
      
      if (isNew) {
        if (draft) {
          // Спрашиваем пользователя хочет ли он восстановить черновик
          Alert.alert(
            '✨ Найден черновик',
            'Восстановить несохранённый текст?',
            [
              { 
                text: 'Начать заново', 
                style: 'destructive',
                onPress: async () => {
                  await clearDraft();
                  setTitle('');
                  setContent('');
                  setContentHeight(100);
                  lastHeight.current = 100;
                  initialContent.current = { title: '', content: '' };
                  setHasUnsavedChanges(false);
                }
              },
              { 
                text: 'Восстановить', 
                onPress: () => {
                  setTitle(draft.title || '');
                  setContent(draft.content || '');
                  const lines = (draft.content || '').split('\n').length;
                  const height = Math.max(100, lines * 32);
                  setContentHeight(height);
                  lastHeight.current = height;
                  initialContent.current = { title: '', content: '' };
                  setHasUnsavedChanges(true);
                }
              },
            ]
          );
        } else {
          setTitle('');
          setContent('');
          setContentHeight(100);
          lastHeight.current = 100;
          initialContent.current = { title: '', content: '' };
          setHasUnsavedChanges(false);
        }
      } else if (noteId) {
        // Для существующей заметки - сначала загружаем её, потом проверяем черновик
        setLoading(true);
        try {
          // Загружаем оригинал заметки
          const localNote = await notesRepository.getById(noteId);
          const originalTitle = localNote?.title || '';
          const originalContent = localNote?.content || '';
          
          // Проверяем черновик
          if (draft && draft.noteId === noteId) {
            // Черновик есть и он для этой заметки
            // Проверяем отличается ли черновик от оригинала
            const draftChanged = draft.title !== originalTitle || draft.content !== originalContent;
            
            if (draftChanged && (draft.title || draft.content)) {
              // Черновик отличается - спрашиваем
              setLoading(false);
              Alert.alert(
                'Найден черновик',
                'Восстановить несохранённые изменения?',
                [
                  { 
                    text: 'Нет, загрузить оригинал', 
                    onPress: () => {
                      clearDraft();
                      setTitle(originalTitle);
                      setContent(originalContent);
                      initialContent.current = { title: originalTitle, content: originalContent };
                      const initialHeight = Math.max(100, originalContent.split('\n').length * 32);
                      setContentHeight(initialHeight);
                      lastHeight.current = initialHeight;
                    }
                  },
                  { 
                    text: 'Да, восстановить', 
                    onPress: () => {
                      setTitle(draft.title || '');
                      setContent(draft.content || '');
                      initialContent.current = { title: originalTitle, content: originalContent };
                      setHasUnsavedChanges(true);
                    }
                  },
                ]
              );
            } else {
              // Черновик такой же как оригинал - просто загружаем и очищаем черновик
              await clearDraft();
              setTitle(originalTitle);
              setContent(originalContent);
              initialContent.current = { title: originalTitle, content: originalContent };
              const initialHeight = Math.max(100, originalContent.split('\n').length * 32);
              setContentHeight(initialHeight);
              lastHeight.current = initialHeight;
              setLoading(false);
            }
          } else {
            // Черновика нет или он для другой заметки - просто загружаем
            setTitle(originalTitle);
            setContent(originalContent);
            initialContent.current = { title: originalTitle, content: originalContent };
            const initialHeight = Math.max(100, originalContent.split('\n').length * 32);
            setContentHeight(initialHeight);
            lastHeight.current = initialHeight;
            setLoading(false);
            
            // Если онлайн - пробуем обновить с сервера
            if (isOnline && token && !noteId.startsWith('local_')) {
              try {
                const response = await fetch(`${API_URL}/api/notes/${noteId}`, {
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (response.ok) {
                  const note = await response.json();
                  setTitle(note.title);
                  setContent(note.content);
                  initialContent.current = { title: note.title, content: note.content };
                }
              } catch (e) {
                // Сервер недоступен - используем локальные данные
              }
            }
          }
        } catch (error) {
          console.error('Error loading note:', error);
          setLoading(false);
        }
      }
    };
    
    initNote();
  }, [noteId, isNew]);

  // Отслеживание несохранённых изменений
  useEffect(() => {
    const hasChanges = 
      title !== initialContent.current.title || 
      content !== initialContent.current.content;
    setHasUnsavedChanges(hasChanges);
  }, [title, content]);

  // Автосохранение при закрытии/обновлении страницы (Web)
  // Черновик уже сохраняется через iOS lifecycle events

  const handleBack = async () => {
    // Автосохранение: если есть текст - сохраняем, иначе просто выходим
    if (title.trim() || content.trim()) {
      // Есть что сохранять - сохраняем автоматически
      await saveNote();
    } else {
      // Пустая заметка - просто выходим
      await clearDraft();
      goBack();
    }
  };

  const goBack = () => {
    if (Platform.OS === 'web' && window.history.length <= 1) {
      router.replace('/');
    } else {
      router.back();
    }
  };

  const loadNote = async (id: string) => {
    setLoading(true);
    try {
      // Сначала пробуем из локального хранилища
      const localNote = await notesRepository.getById(id);
      if (localNote) {
        setTitle(localNote.title);
        setContent(localNote.content);
        initialContent.current = { title: localNote.title, content: localNote.content };
        const initialHeight = Math.max(100, localNote.content.split('\n').length * 32);
        setContentHeight(initialHeight);
        lastHeight.current = initialHeight;
      }

      // Если онлайн и это не локальная заметка - пробуем обновить с сервера
      if (isOnline && token && !id.startsWith('local_')) {
        try {
          const response = await fetch(`${API_URL}/api/notes/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (response.ok) {
            const note = await response.json();
            setTitle(note.title);
            setContent(note.content);
            initialContent.current = { title: note.title, content: note.content };
          }
        } catch (e) {
          // Сервер недоступен - используем локальные данные
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
      await clearDraft();
      goBack();
      return;
    }

    setSaving(true);

    try {
      const noteIdToSave = (isNew || noteId.startsWith('new_')) ? null : noteId;
      const result = await notesRepository.save(noteIdToSave, title, content);
      
      if (result.success) {
        await clearDraft();
        goBack();
      } else {
        // Ошибка сохранения - черновик остаётся
        if (Platform.OS === 'web') {
          alert('Не удалось сохранить. Черновик сохранён.');
        } else {
          Alert.alert('Ошибка', result.error || 'Не удалось сохранить заметку');
        }
      }
    } catch (error) {
      console.error('Error saving note:', error);
      if (Platform.OS === 'web') {
        alert('Не удалось сохранить. Черновик сохранён.');
      } else {
        Alert.alert('Ошибка', 'Не удалось сохранить заметку');
      }
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
        
        {/* Индикатор статуса: спиннер при сохранении, галочка когда сохранено */}
        <View style={styles.saveIndicator}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons 
              name="checkmark-circle" 
              size={22} 
              color={isDark ? '#4ade80' : '#22c55e'} 
            />
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={[
            styles.paperContainer, 
            { backgroundColor: isDark ? '#1a1a1a' : colors.background }
          ]}
          contentContainerStyle={[
            styles.paperContentContainer,
            { paddingBottom: 200 } // Большой отступ снизу - текст не прямо над клавиатурой
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
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
              selectionColor={isDark ? '#C5A572' : '#8B7355'}
              cursorColor={isDark ? '#C5A572' : '#8B7355'}
            />

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
              selectionColor={isDark ? '#C5A572' : '#8B7355'}
              cursorColor={isDark ? '#C5A572' : '#8B7355'}
              onSelectionChange={(e) => {
                // Автопрокрутка к позиции курсора
                const { start } = e.nativeEvent.selection;
                const textBeforeCursor = content.substring(0, start);
                const linesBeforeCursor = textBeforeCursor.split('\n').length;
                const lineHeight = 32; // соответствует lineHeight в стилях
                const headerOffset = 150; // примерная высота заголовка и кнопки времени
                const cursorY = headerOffset + (linesBeforeCursor * lineHeight);
                
                // Прокручиваем только если курсор ниже середины экрана
                scrollViewRef.current?.scrollTo({
                  y: Math.max(0, cursorY - 250), // 250px от верха экрана
                  animated: true,
                });
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating кнопка добавления времени - в стиле Apple */}
      <TouchableOpacity 
        style={[
          styles.floatingTimeBtn,
          { 
            backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? 'rgba(197, 165, 114, 0.3)' : 'rgba(139, 115, 85, 0.15)',
          }
        ]} 
        onPress={insertCurrentTime}
        activeOpacity={0.8}
      >
        <Ionicons 
          name="time-outline" 
          size={18} 
          color={isDark ? '#E8CFA0' : '#8B7355'} 
        />
      </TouchableOpacity>
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
    flex: 1,
    textAlign: 'center',
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    width: 60,
  },
  saveIndicator: {
    width: 60,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  saveStatus: {
    fontSize: 12,
    fontWeight: '500',
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
    paddingRight: 24,
    paddingTop: 28,
    paddingBottom: 60,
  },
  noteContentAreaDark: {
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 32,
    paddingBottom: 40,
    marginHorizontal: 16,
    marginTop: 20,
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
  floatingTimeBtn: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.15)',
    // Тени в стиле Apple
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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

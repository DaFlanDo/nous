
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import Markdown from 'react-native-markdown-display';
import { useAuthContext } from './_layout';
import { useOffline } from '@/lib/offline';
import { useTheme } from '@/lib/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

interface ChecklistSuggestion {
  items: string[];
  reasoning?: string;
}

export default function ChatScreen() {
  const { token } = useAuthContext();
  const { colors, isDark } = useTheme();
  const { isOnline } = useOffline({ token });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [inputHeight, setInputHeight] = useState(44);
  const [loading, setLoading] = useState(false);
  const [updatingState, setUpdatingState] = useState(false);
  const [historySummary, setHistorySummary] = useState<string | null>(null);  // Сжатая история
  const flatListRef = useRef<FlatList>(null);
  
  // История сеансов
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  // Предложение чеклиста
  const [showChecklistSuggestion, setShowChecklistSuggestion] = useState(false);
  const [checklistSuggestion, setChecklistSuggestion] = useState<ChecklistSuggestion | null>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  
  // Создание выжимки
  const [creatingSummary, setCreatingSummary] = useState(false);
  // Анимация для предложения чеклиста
  const suggestionAnim = useRef(new Animated.Value(0)).current;

  // Загрузка сессий
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const response = await fetch(`${API_URL}/api/chat/sessions`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
        
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Создание новой сессии
  const createNewSession = async () => {
    try {
      const response = await fetch(`${API_URL}/api/chat/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: 'Новый диалог' }),
      });
      if (response.ok) {
        const session = await response.json();
        setCurrentSessionId(session.id);
        setMessages([]);
        setHistorySummary(null);  // Сбрасываем саммари при новой сессии
        fetchSessions();
        return session.id;
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }
    return null;
  };

  // Загрузка сессии
  const loadSession = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/chat/sessions/${sessionId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const session = await response.json();
        setCurrentSessionId(session.id);
        setMessages(session.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.created_at),
        })));
        setHistorySummary(session.history_summary || null);  // Загружаем саммари
        setShowSessionsModal(false);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  // Удаление сессии
  const deleteSession = async (sessionId: string) => {
    try {
      await fetch(`${API_URL}/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      fetchSessions();
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  // Получение предложений для чеклиста
  const fetchChecklistSuggestions = async () => {
    if (messages.length < 2) return;
    
    setLoadingChecklist(true);
    try {
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,}));

      const response = await fetch(`${API_URL}/api/chat/suggest-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: messages[messages.length - 1]?.content || '',
          history: history.slice(0, -1),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          setChecklistSuggestion(data);setShowChecklistSuggestion(true);
          Animated.spring(suggestionAnim, {
            toValue: 1,
            useNativeDriver: true,tension: 50,
            friction: 7,
          }).start();
        }
      }
    } catch (error) {
      console.error('Error fetching checklist suggestions:', error);
    } finally {
      setLoadingChecklist(false);
    }
  };

  // Принять чеклист
  const acceptChecklist = async () => {
    if (!checklistSuggestion) return;
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const items = checklistSuggestion.items.map((text, index) => ({
        id: `${Date.now()}-${index}`,
        text,
        completed: false,
      }));

      await fetch(`${API_URL}/api/checklists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          date: today,
          items,
        }),
      });

      // Добавляем сообщение об успехе
      const successMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Добавлено ${items.length} задач в чеклист на сегодня`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);
      dismissChecklistSuggestion();
    } catch (error) {
      console.error('Error adding checklist:', error);
    }
  };

  // Отклонить чеклист
  const dismissChecklistSuggestion = () => {
    Animated.timing(suggestionAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowChecklistSuggestion(false);
      setChecklistSuggestion(null);
    });
  };

  // Создание выжимки
  const createSummary = async () => {
    if (!currentSessionId || messages.length < 2) return;
    
    setCreatingSummary(true);
    try {
      const response = await fetch(`${API_URL}/api/chat/sessions/${currentSessionId}/summary`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (response.ok) {
        const data = await response.json();
        const successMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `📝 Выжимка создана и сохранена в записки!\n\n"${data.note.title}"`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, successMessage]);}
    } catch (error) {
      console.error('Error creating summary:', error);
    } finally {
      setCreatingSummary(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return;

    // Создаём сессию если её нет
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = await createNewSession();
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: sessionId,
          history,
          history_summary: historySummary,  // Отправляем сжатую историю
          update_state: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        // Обновляем history_summary если бэкенд вернул новый
        if (data.history_summary) {
          setHistorySummary(data.history_summary);
        }
        
        // Если ИИ предлагает чеклист - сразу показываем (items уже в ответе!)
        if (data.suggest_checklist && data.checklist_items?.length > 0) {
          setChecklistSuggestion({ items: data.checklist_items });
          setShowChecklistSuggestion(true);
          Animated.spring(suggestionAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
        
        if (data.state_updated) {
          const stateMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `✓ Состояние обновлено\n${data.state?.analysis || ''}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, stateMessage]);
        }
      } else {
        throw new Error('Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Извините, что-то пошло не так. Попробуйте ещё раз.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setUpdatingState(false);
    }
  };

  const updateStateFromChat = async () => {
    if (messages.length === 0) return;
    
    setUpdatingState(true);
    try {
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: 'Проанализируй мое состояние на основе нашего разговора',
          session_id: currentSessionId,
          history,
          update_state: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.state_updated) {
          const stateMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `✓ Состояние обновлено\n${data.state?.analysis || ''}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, stateMessage]);
        }
      }
    } catch (error) {
      console.error('Update state error:', error);
    } finally {
      setUpdatingState(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setShowChecklistSuggestion(false);
    setChecklistSuggestion(null);
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageContainer,
        item.role === 'user' ? styles.userMessageContainer : styles.assistantMessageContainer,
      ]}
    >
      {item.role === 'assistant' && (
        <View style={[styles.avatarContainer, { backgroundColor: isDark ? colors.surface : '#F0EBE3' }]}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
        </View>
      )}
      <View
        style={[
          styles.messageBubble,
          item.role === 'user' 
            ? [styles.userBubble, { backgroundColor: colors.primary }] 
            : [styles.assistantBubble, { backgroundColor: colors.cardBackground }],
        ]}
      >
        <Text style={[styles.messageText, { color: item.role === 'user' ? '#FFFFFF' : colors.text }]}>
          {item.content}
        </Text></View>
    </View>
  );

  const renderSessionItem = ({ item }: { item: ChatSession }) => (
    <TouchableOpacity
      style={[
        styles.sessionItem,
        { backgroundColor: colors.cardBackground },
        currentSessionId === item.id && [styles.sessionItemActive, { borderColor: colors.primary }]
      ]}
      onPress={() => loadSession(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.sessionInfo}>
        <Text style={[styles.sessionTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.sessionDate, { color: colors.textSecondary }]}>
          {format(new Date(item.updated_at), 'd MMM, HH:mm', { locale: ru })}
        </Text>
        <Text style={[styles.sessionMessages, { color: colors.textSecondary }]}>
          {item.messages?.length || 0} сообщений
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteSessionBtn}
        onPress={() => deleteSession(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Офлайн заглушка
  if (!isOnline) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <View>
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Диалог</Text>
              <Text style={styles.greekAccent}>νοῦς</Text>
            </View>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Nous AI</Text>
          </View>
        </View>
        
        <View style={styles.offlineContainer}>
          <View style={[styles.offlineIcon, { backgroundColor: isDark ? 'rgba(139,115,85,0.15)' : '#f5f0e8' }]}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.offlineTitle, { color: colors.text }]}>Нет подключения</Text>
          <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
            Диалог с AI доступен только{'\n'}при подключении к интернету
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Диалог</Text>
            <Text style={[styles.greekAccent, { color: colors.textSecondary }]}>νοῦς</Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Nous AI</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            onPress={() => setShowSessionsModal(true)} 
            style={[styles.historyBtn, { backgroundColor: isDark ? colors.surface : '#F0EBE3' }]}
          >
            <Ionicons name="time-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          {messages.length > 0 && (
            <>
              <TouchableOpacity 
                onPress={createSummary} 
                style={[styles.summaryBtn, { backgroundColor: isDark ? colors.surface : '#F0EBE3' }]}
                disabled={creatingSummary || messages.length < 2}
              >
                {creatingSummary ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={updateStateFromChat} 
                style={[styles.stateBtn, { backgroundColor: isDark ? colors.surface : '#F0EBE3' }]}
                disabled={updatingState}
              >
                {updatingState ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="pulse" size={20} color={colors.primary} />
                )}
              </TouchableOpacity><TouchableOpacity onPress={clearChat} style={styles.clearBtn}>
                <Ionicons name="add-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.aiIcon, { backgroundColor: isDark ? colors.surface : '#F0EBE3' }]}>
              <Ionicons name="sparkles" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nous AI</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Поделитесь тем, что вас занимает.{"\n"}
              Я помогу разобраться в мыслях.
            </Text>

            <View style={styles.suggestions}>
              <TouchableOpacity
                style={[styles.suggestionBtn, { backgroundColor: colors.cardBackground }]}
                onPress={() => setInputText('Хочу разобраться в своих чувствах...')}
                activeOpacity={0.7}
              >
                <Ionicons name="heart-outline" size={18} color={colors.primary} />
                <Text style={[styles.suggestionBtnText, { color: colors.text }]}>Разобраться в чувствах</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.suggestionBtn, { backgroundColor: colors.cardBackground }]}
                onPress={() => setInputText('Помоги мне подвести итоги дня...')}
                activeOpacity={0.7}
              >
                <Ionicons name="sunny-outline" size={18} color={colors.primary} />
                <Text style={[styles.suggestionBtnText, { color: colors.text }]}>Подвести итоги дня</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.suggestionBtn, { backgroundColor: colors.cardBackground }]}
                onPress={() => setInputText('Хочу понять, что меня беспокоит...')}
                activeOpacity={0.7}
              >
                <Ionicons name="cloud-outline" size={18} color={colors.primary} />
                <Text style={[styles.suggestionBtnText, { color: colors.text }]}>Понять беспокойство</Text>
              </TouchableOpacity>
            </View>

            {sessions.length > 0 && (
              <TouchableOpacity
                style={styles.viewHistoryBtn}
                onPress={() => setShowSessionsModal(true)}
              >
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={[styles.viewHistoryText, { color: colors.primary }]}>Посмотреть историю диалогов</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
          />
        )}

        {loading && (
          <View style={[styles.typingIndicator, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.typingDots}>
              <View style={[styles.dot, styles.dot1, { backgroundColor: colors.primary }]} />
              <View style={[styles.dot, styles.dot2, { backgroundColor: colors.primary }]} />
              <View style={[styles.dot, styles.dot3, { backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.typingText, { color: colors.textSecondary }]}>Думаю...</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Поле ввода - закреплено над Tab Bar */}
      <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <View style={[styles.inputContainer, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <TextInput
            style={[
              styles.input,
              { height: Math.min(Math.max(inputHeight, 44), 150), color: colors.text }
            ]}
            placeholder="О чём хотите поговорить?"
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            onContentSizeChange={(e) => {
              const height = e.nativeEvent.contentSize.height;
              setInputHeight(height);
            }}
            multiline
            textAlignVertical="center"
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary }, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || loading}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Модальное окно предложения чеклиста - Apple Style Sheet */}
      <Modal 
        visible={showChecklistSuggestion && !!checklistSuggestion} 
        animationType="slide" 
        transparent={true}
        onRequestClose={dismissChecklistSuggestion}
      >
        <View style={styles.checklistModalOverlay}>
          <TouchableOpacity 
            style={styles.checklistModalBackdrop} 
            activeOpacity={1} 
            onPress={dismissChecklistSuggestion}
          />
          <Animated.View 
            style={[
              styles.checklistModalSheet,
              { backgroundColor: isDark ? '#1c1c1e' : '#ffffff' }
            ]}
          >
            {/* Ручка для свайпа */}
            <View style={styles.checklistModalHandle}>
              <View style={[styles.handleBar, { backgroundColor: isDark ? '#3a3a3c' : '#d1d1d6' }]} />
            </View>

            {/* Заголовок */}
            <View style={styles.checklistModalHeader}>
              <View style={[styles.checklistModalIcon, { backgroundColor: isDark ? '#2c2c2e' : '#f2f2f7' }]}>
                <Ionicons name="list" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.checklistModalTitle, { color: colors.text }]}>
                Добавить задачи?
              </Text>
              <TouchableOpacity 
                onPress={dismissChecklistSuggestion} 
                style={[styles.checklistModalCloseBtn, { backgroundColor: isDark ? '#2c2c2e' : '#f2f2f7' }]}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Список задач */}
            <ScrollView style={styles.checklistModalContent} showsVerticalScrollIndicator={false}>
              {checklistSuggestion?.items.map((item, index) => (
                <View 
                  key={index} 
                  style={[
                    styles.checklistModalItem,
                    { backgroundColor: isDark ? '#2c2c2e' : '#f2f2f7' }
                  ]}
                >
                  <View style={[styles.checklistModalCheckbox, { borderColor: colors.primary }]}>
                    <Ionicons name="checkmark" size={12} color={colors.primary} />
                  </View>
                  <Text style={[styles.checklistModalItemText, { color: colors.text }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* Кнопки действий */}
            <View style={styles.checklistModalActions}>
              <TouchableOpacity 
                style={[
                  styles.checklistModalBtn,
                  styles.checklistModalBtnSecondary,
                  { backgroundColor: isDark ? '#2c2c2e' : '#f2f2f7' }
                ]} 
                onPress={dismissChecklistSuggestion}
              >
                <Text style={[styles.checklistModalBtnText, { color: colors.textSecondary }]}>
                  Не сейчас
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.checklistModalBtn,
                  styles.checklistModalBtnPrimary,
                  { backgroundColor: colors.primary }
                ]} 
                onPress={acceptChecklist}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={[styles.checklistModalBtnText, { color: '#FFFFFF' }]}>
                  Добавить
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Модальное окно истории сеансов */}
      <Modal visible={showSessionsModal} animationType="slide" transparent={false}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowSessionsModal(false)}>
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Закрыть</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>История диалогов</Text>
            <View style={{ width: 24 }} />
          </View>

          {loadingSessions ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} /></View>
          ) : sessions.length === 0 ? (
            <View style={styles.emptySessionsContainer}>
              <View style={[styles.emptySessionsIcon, { backgroundColor: isDark ? colors.surface : '#F0EBE3' }]}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} />
              </View>
              <Text style={[styles.emptySessionsText, { color: colors.text }]}>Нет сохранённых диалогов</Text>
              <Text style={[styles.emptySessionsSubtext, { color: colors.textSecondary }]}>
                Начните новый диалог, отправив первое сообщение
              </Text>
            </View>
          ) : (
            <FlatList
              data={sessions}
              renderItem={renderSessionItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.sessionsList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E2D9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '300',
    color: '#5D4E3A',
    letterSpacing: -0.3,
  },
  greekAccent: {
    fontSize: 14,
    color: '#C4B8A8',
    fontStyle: 'italic',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#A89F91',
    marginTop: 3,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyBtn: {
    padding: 8,
    backgroundColor: '#F0EBE3',
    borderRadius: 8,
  },
  summaryBtn: {
    padding: 8,
    backgroundColor: '#F0EBE3',
    borderRadius: 8,
  },
  stateBtn: {
    padding: 8,
    backgroundColor: '#F0EBE3',
    borderRadius: 8,
  },
  chatContainer: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  aiIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '300',
    color: '#5D4E3A',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 15,
    color: '#A89F91',
    textAlign: 'center',
    lineHeight: 24,
  },
  suggestions: {
    marginTop: 36,
    width: '100%',
  },
  suggestionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  suggestionBtnText: {
    color: '#5D4E3A',
    fontSize: 15,
    marginLeft: 14,
  },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    padding: 12,
  },
  viewHistoryText: {
    color: '#8B7355',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  messagesList: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'web' ? 200 : Platform.OS === 'ios' ? 220 : 180,
  },
  messageContainer: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 20,
    padding: 16,
  },
  userBubble: {
    backgroundColor: '#8B7355',
    borderBottomRightRadius: 6,
    marginLeft: 'auto',
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    color: '#5D4E3A',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  // Apple Style Checklist Modal
  checklistModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  checklistModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  checklistModalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: '70%',
  },
  checklistModalHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handleBar: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d1d6',
  },
  checklistModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  checklistModalIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f2f2f7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  checklistModalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  checklistModalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f2f2f7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklistModalContent: {
    paddingHorizontal: 20,
    maxHeight: 300,
  },
  checklistModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  checklistModalCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  checklistModalItemText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  checklistModalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  checklistModalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  checklistModalBtnSecondary: {
    backgroundColor: '#f2f2f7',
  },
  checklistModalBtnPrimary: {
    backgroundColor: '#8B7355',
  },
  checklistModalBtnText: {
    fontSize: 17,
    fontWeight: '600',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C4B8A8',
    marginRight: 4,
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.6,
  },
  dot3: {
    opacity: 0.8,
  },
  typingText: {
    color: '#A89F91',
    fontSize: 13,
  },
  inputWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 95 : Platform.OS === 'ios' ? 110 : 90,
    left: 16,
    right: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: '#5D4E3A',
    fontSize: 16,
    lineHeight: 22,
    outlineStyle: 'none' as const,
  } as any,
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8B7355',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D4CCC0',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E2D9',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#A89F91',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#5D4E3A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionsList: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 120 : 100,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sessionItemActive: {
    borderWidth: 2,
    borderColor: '#8B7355',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 4,
  },
  sessionDate: {
    fontSize: 13,
    color: '#A89F91',
    marginBottom: 2,
  },
  sessionMessages: {
    fontSize: 12,
    color: '#C4B8A8',
  },
  deleteSessionBtn: {
    padding: 8,
  },
  emptySessionsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptySessionsIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptySessionsText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#8B7355',
    marginBottom: 8,
  },
  emptySessionsSubtext: {
    fontSize: 14,
    color: '#A89F91',
    textAlign: 'center',
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  offlineIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f5f0e8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 12,
  },
  offlineText: {
    fontSize: 15,
    color: '#A89F91',
    textAlign: 'center',
    lineHeight: 22,
  },
});

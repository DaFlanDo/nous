import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuthContext } from './_layout';
import { useChecklists, useOffline, ChecklistTemplate } from './_offline';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

interface DailyChecklist {
  id: string;
  date: string;
  items: ChecklistItem[];
  template_id?: string;
}

export default function ChecklistsScreen() {
  const { token } = useAuthContext();
  const [todayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Используем офлайн хуки
  const { isOnline } = useOffline({ token });
  const { 
    checklist: dailyChecklist, 
    loading, 
    addItem: addChecklistItem,
    toggleItem: toggleChecklistItem,
    removeItem: removeChecklistItem,
    applyTemplate: applyChecklistTemplate,
    refresh: refreshChecklist,
  } = useChecklists({ token, date: todayDate });
  
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateItems, setNewTemplateItems] = useState<string[]>(['']);

  // Загрузка шаблонов (чеклист загружается через хук)
  const fetchTemplates = useCallback(async () => {
    if (!isOnline || !token) return;
    
    try {
      const response = await fetch(`${API_URL}/api/templates`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, [isOnline, token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const addItem = async () => {
    if (!newItemText.trim()) return;
    
    const success = await addChecklistItem(newItemText);
    if (success) {
      setNewItemText('');
    }
  };

  const toggleItem = async (itemId: string) => {
    await toggleChecklistItem(itemId);
  };

  const removeItem = async (itemId: string) => {
    await removeChecklistItem(itemId);
  };

  const applyTemplate = async (template: ChecklistTemplate) => {
    await applyChecklistTemplate(template);
  };

  const saveTemplate = async () => {
    if (!newTemplateName.trim() || newTemplateItems.filter(i => i.trim()).length === 0) return;

    try {
      const response = await fetch(`${API_URL}/api/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          items: newTemplateItems.filter(i => i.trim()),
        }),
      });

      if (response.ok) {
        fetchTemplates();
        setShowTemplateModal(false);
        setNewTemplateName('');
        setNewTemplateItems(['']);
      }
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    try {
      await fetch(`${API_URL}/api/templates/${templateId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      setTemplates(templates.filter(t => t.id !== templateId));
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const completedCount = dailyChecklist?.items.filter(i => i.completed).length || 0;
  const totalCount = dailyChecklist?.items.length || 0;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B7355" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Чеклисты</Text>
          <Text style={styles.headerDate}>
            {format(new Date(), 'EEEE, d MMMM', { locale: ru })}
          </Text>
        </View>

        {/* Progress */}
        {totalCount > 0 && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Прогресс дня</Text>
              <Text style={styles.progressValue}>{completedCount}/{totalCount}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
            </View>
            {progressPercentage === 100 && (
              <Text style={styles.completeText}>Отличная работа!</Text>
            )}
          </View>
        )}

        {/* Today's checklist */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Сегодня</Text>

          {dailyChecklist?.items.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.checkItem}
              onPress={() => toggleItem(item.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
                {item.completed && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
              <Text style={[styles.checkItemText, item.completed && styles.checkItemTextCompleted]}>
                {item.text}
              </Text>
              <TouchableOpacity 
                onPress={() => removeItem(item.id)} 
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.removeBtn}
              >
                <Ionicons name="close" size={16} color="#C4B8A8" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          {/* Add new item */}
          <View style={styles.addItemContainer}>
            <TextInput
              style={styles.addItemInput}
              placeholder="Добавить намерение..."
              placeholderTextColor="#A89F91"
              value={newItemText}
              onChangeText={setNewItemText}
              onSubmitEditing={addItem}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addItemButton} onPress={addItem} activeOpacity={0.7}>
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Templates */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Шаблоны</Text>
            <TouchableOpacity
              style={styles.newTemplateBtn}
              onPress={() => setShowTemplateModal(true)}
            >
              <Ionicons name="add" size={18} color="#8B7355" />
              <Text style={styles.newTemplateText}>Создать</Text>
            </TouchableOpacity>
          </View>

          {templates.length === 0 ? (
            <View style={styles.emptyTemplates}>
              <View style={styles.emptyIcon}>
                <Ionicons name="copy-outline" size={32} color="#C4B8A8" />
              </View>
              <Text style={styles.emptyTemplatesText}>Нет сохранённых шаблонов</Text>
              <Text style={styles.emptyTemplatesSubtext}>
                Создайте шаблон для повторяющихся задач
              </Text>
            </View>
          ) : (
            templates.map(template => (
              <View key={template.id} style={styles.templateCard}>
                <View style={styles.templateInfo}>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateItemCount}>
                    {template.items.length} {template.items.length === 1 ? 'задача' : 'задач'}
                  </Text>
                </View>
                <View style={styles.templateActions}>
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => applyTemplate(template)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.applyBtnText}>Добавить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => deleteTemplate(template.id)}
                    style={styles.deleteTemplateBtn}
                  >
                    <Ionicons name="close" size={16} color="#C4B8A8" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Create Template Modal */}
      <Modal visible={showTemplateModal} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowTemplateModal(false)}>
              <Text style={styles.modalCancelText}>Отмена</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Новый шаблон</Text>
            <TouchableOpacity onPress={saveTemplate}>
              <Text style={styles.modalSaveText}>Сохранить</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <TextInput
              style={styles.templateNameInput}
              placeholder="Название шаблона"
              placeholderTextColor="#A89F91"
              value={newTemplateName}
              onChangeText={setNewTemplateName}
            />

            <Text style={styles.itemsLabel}>Задачи:</Text>

            {newTemplateItems.map((item, index) => (
              <View key={index} style={styles.templateItemRow}>
                <TextInput
                  style={styles.templateItemInput}
                  placeholder={`Задача ${index + 1}`}
                  placeholderTextColor="#A89F91"
                  value={item}
                  onChangeText={text => {
                    const updated = [...newTemplateItems];
                    updated[index] = text;
                    setNewTemplateItems(updated);
                  }}
                />
                {newTemplateItems.length > 1 && (
                  <TouchableOpacity
                    onPress={() => {
                      setNewTemplateItems(newTemplateItems.filter((_, i) => i !== index));
                    }}
                    style={styles.removeItemBtn}
                  >
                    <Ionicons name="close-circle" size={22} color="#C4B8A8" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={styles.addMoreBtn}
              onPress={() => setNewTemplateItems([...newTemplateItems, ''])}
            >
              <Ionicons name="add-circle-outline" size={22} color="#8B7355" />
              <Text style={styles.addMoreText}>Добавить задачу</Text>
            </TouchableOpacity>
          </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'ios' ? 120 : 100,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#5D4E3A',
    letterSpacing: -0.5,
  },
  headerDate: {
    fontSize: 14,
    color: '#A89F91',
    marginTop: 6,
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  progressCard: {
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  progressLabel: {
    color: '#8B7355',
    fontSize: 14,
    fontWeight: '500',
  },
  progressValue: {
    color: '#5D4E3A',
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#F0EBE3',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#9CB686',
    borderRadius: 3,
  },
  completeText: {
    color: '#9CB686',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 16,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D4CCC0',
    marginRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#9CB686',
    borderColor: '#9CB686',
  },
  checkItemText: {
    flex: 1,
    fontSize: 15,
    color: '#5D4E3A',
  },
  checkItemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#A89F91',
  },
  removeBtn: {
    padding: 4,
  },
  addItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  addItemInput: {
    flex: 1,
    backgroundColor: '#F0EBE3',
    borderRadius: 16,
    padding: 16,
    color: '#5D4E3A',
    fontSize: 15,
    marginRight: 12,
  },
  addItemButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#8B7355',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newTemplateText: {
    color: '#8B7355',
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '500',
  },
  emptyTemplates: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTemplatesText: {
    color: '#8B7355',
    fontSize: 16,
    fontWeight: '500',
  },
  emptyTemplatesSubtext: {
    color: '#A89F91',
    fontSize: 14,
    marginTop: 6,
  },
  templateCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5D4E3A',
  },
  templateItemCount: {
    fontSize: 13,
    color: '#A89F91',
    marginTop: 4,
  },
  templateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  applyBtn: {
    backgroundColor: '#F0EBE3',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  applyBtnText: {
    color: '#8B7355',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteTemplateBtn: {
    padding: 4,
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
  modalCancelText: {
    fontSize: 16,
    color: '#A89F91',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#5D4E3A',
  },
  modalSaveText: {
    fontSize: 16,
    color: '#8B7355',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  templateNameInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    color: '#5D4E3A',
    fontSize: 17,
    marginBottom: 28,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  itemsLabel: {
    color: '#8B7355',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 14,
  },
  templateItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  templateItemInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    color: '#5D4E3A',
    fontSize: 15,
    marginRight: 12,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  removeItemBtn: {
    padding: 4,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  addMoreText: {
    color: '#8B7355',
    fontSize: 15,
    marginLeft: 8,
    fontWeight: '500',
  },
});

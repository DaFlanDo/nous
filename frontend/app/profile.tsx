import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthContext } from './_layout';
import { useTheme } from './theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuthContext();
  const { isDark, toggleTheme, colors } = useTheme();
  const router = useRouter();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleSignOut = () => {
    setShowConfirmModal(true);
  };

  const confirmSignOut = () => {
    setShowConfirmModal(false);
    signOut();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Заголовок */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Профиль</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Карточка пользователя */}
        <View style={[styles.userCard, { backgroundColor: colors.cardBackground }]}>
          <View style={styles.avatarContainer}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surface }]}>
                <Ionicons name="person" size={40} color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={[styles.userName, { color: colors.text }]}>{user?.name}</Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
        </View>

        {/* Настройки темы */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Настройки</Text>
          <View style={[styles.settingCard, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingIcon}>
                <Ionicons name={isDark ? "moon" : "sunny"} size={24} color={colors.primary} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>Тёмная тема</Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>Переключить цветовую схему</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#D4C5B0', true: colors.primary }}
                thumbColor={isDark ? colors.accent : '#f4f3f4'}
              />
            </View>
          </View>
        </View>

        {/* Информация */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>О приложении</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.appName, { color: colors.text }]}>Nous</Text>
            <Text style={[styles.appSubtitle, { color: colors.textSecondary }]}>νοῦς</Text>
            <Text style={[styles.appDescription, { color: colors.textSecondary }]}>
              Пространство для мыслей и рефлексии
            </Text>
            <Text style={[styles.version, { color: colors.textSecondary }]}>Версия 1.0.0</Text>
          </View>
        </View>

        {/* Кнопка выхода */}
        <View style={styles.section}>
          <TouchableOpacity style={[styles.signOutButton, { backgroundColor: colors.cardBackground, borderColor: colors.error }]} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={[styles.signOutText, { color: colors.error }]}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Модальное окно подтверждения */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="log-out-outline" size={48} color={colors.error} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Выход из аккаунта</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Вы уверены, что хотите выйти?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButtonCancel, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={[styles.modalButtonCancelText, { color: colors.text }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonConfirm, { backgroundColor: colors.error }]}
                onPress={confirmSignOut}
              >
                <Text style={styles.modalButtonConfirmText}>Выйти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E2D9',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#5D4E3A',
  },
  userCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#8B7355',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: '#8B7355',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  appName: {
    fontSize: 32,
    fontWeight: '300',
    color: '#5D4E3A',
    letterSpacing: 4,
  },
  appSubtitle: {
    fontSize: 18,
    color: '#C4B8A8',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 16,
  },
  appDescription: {
    fontSize: 14,
    color: '#8B7355',
    textAlign: 'center',
    marginBottom: 8,
  },
  version: {
    fontSize: 12,
    color: '#C4B8A8',
    marginTop: 8,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    shadowColor: '#D32F2F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D32F2F',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#FAF8F5',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#8B7355',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E2D9',
    alignItems: 'center',
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B7355',
  },
  modalButtonConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#D32F2F',
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

import React, { useState, useEffect, createContext, useContext } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Platform, View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import LoginScreen, { useAuth, User, authStorage } from './auth';
import { ThemeProvider, useTheme } from '@/lib/theme';

// Контекст авторизации для использования в других компонентах
interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}

function AppTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  // Для iOS PWA нужен отступ для home indicator
  // На web (PWA) insets.bottom может быть 0, но на iOS Safari standalone режим
  // нужен фиксированный отступ
  const isWeb = Platform.OS === 'web';
  const isPWA = isWeb && typeof window !== 'undefined' && 
    (window.matchMedia?.('(display-mode: standalone)')?.matches || 
     (window.navigator as any)?.standalone);
  
  // Для iOS PWA добавляем отступ для home indicator (34px на iPhone X+)
  const bottomPadding = isWeb 
    ? (isPWA ? 20 : 8)  // PWA: больший отступ, обычный web: небольшой
    : Math.min(insets.bottom, 16);
  const tabBarHeight = 52 + bottomPadding;
  
  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar, 
            { 
              backgroundColor: colors.background, 
              paddingBottom: bottomPadding,
              height: tabBarHeight,
            }
          ],
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarShowLabel: true,
          tabBarIconStyle: { marginBottom: -2 },
          tabBarBackground: () => (
            <View style={[styles.tabBarBg, { backgroundColor: colors.background }]} />
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Записи',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons 
                name={focused ? "journal" : "journal-outline"} 
                size={size} 
                color={color} 
              />
            ),
          }}
        />
        <Tabs.Screen
          name="checklists"
          options={{
            title: 'Задачи',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons 
                name={focused ? "checkbox" : "checkbox-outline"} 
                size={size} 
                color={color} 
              />
            ),
          }}
        />
        <Tabs.Screen
          name="state"
          options={{
            title: 'Состояние',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons 
                name={focused ? "pulse" : "pulse-outline"} 
                size={size} 
                color={color} 
              />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Диалог',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "sparkles" : "sparkles-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            href: null, // Модальное окно, не вкладка
          }}
        />
        <Tabs.Screen
          name="auth"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="note-edit"
          options={{
            href: null,
            // Редактор на весь экран: запись сохраняется кнопкой «назад»,
            // а уход через вкладки оставлял бы только черновик
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="+not-found"
          options={{
            href: null, // Только перенаправляет на записи, не вкладка
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <ThemeProvider>
        <SafeAreaProvider>
          <LoadingScreen />
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <ThemeProvider>
        <SafeAreaProvider>
          <LoginScreen onLogin={auth.reload} />
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthContext.Provider value={{
        user: auth.user,
        token: auth.token,
        isAuthenticated: auth.isAuthenticated,
        signOut: auth.signOut,
      }}>
        <WebColumn>
          <AppTabs />
        </WebColumn>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

// Интерфейс рассчитан на телефон: в браузере на широком экране
// держим его в колонке по центру, а не растягиваем на весь монитор
function WebColumn({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web' || width <= WEB_COLUMN_WIDTH) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.webOuter, { backgroundColor: colors.background }]}>
      <View style={[styles.webColumn, { borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const WEB_COLUMN_WIDTH = 720;

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    alignItems: 'center',
  },
  webColumn: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_COLUMN_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F1ED',
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 0,
    paddingTop: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -4 },
  },
  tabBarBg: {
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
});

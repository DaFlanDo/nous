import React, { useState, useEffect, createContext, useContext } from 'react';
import { Tabs, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Platform, View, Text, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
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

function AppTabs({ hideTabBar }: { hideTabBar: boolean }) {
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
          // На десктопе навигация в боковом меню, нижняя панель не нужна
          tabBarStyle: hideTabBar ? { display: 'none' } : [
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
        <View style={styles.root}>
          {auth.user?.is_demo && <DemoBanner expiresAt={auth.user.demo_expires_at} onExit={auth.signOut} />}
          <WebShell />
        </View>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

// Интерфейс рассчитан на телефон (mobile first). В браузере:
// до 720px — как в приложении, до 1100px — колонка по центру с нижними
// вкладками, шире — боковое меню слева и колонка контента по центру
type WebLayout = 'native' | 'column' | 'sidebar';

export function useWebLayout(): WebLayout {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width <= WEB_COLUMN_WIDTH) return 'native';
  return width >= SIDEBAR_BREAKPOINT ? 'sidebar' : 'column';
}

function WebShell() {
  const { colors } = useTheme();
  const layout = useWebLayout();
  // Редактор открыт на весь экран: уход через меню оставлял бы только черновик
  const isEditor = usePathname() === '/note-edit';

  if (layout === 'native') {
    return <AppTabs hideTabBar={false} />;
  }

  if (layout === 'column') {
    return (
      <View style={[styles.webOuter, { backgroundColor: colors.background }]}>
        <View style={[styles.webColumn, styles.webColumnBordered, { borderColor: colors.border }]}>
          <AppTabs hideTabBar={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.webRow, { backgroundColor: colors.background }]}>
      {!isEditor && <Sidebar />}
      <View style={styles.webOuter}>
        <View style={styles.webColumn}>
          <AppTabs hideTabBar />
        </View>
      </View>
    </View>
  );
}

const NAV_ITEMS = [
  { href: '/', title: 'Записи', icon: 'journal' },
  { href: '/checklists', title: 'Задачи', icon: 'checkbox' },
  { href: '/state', title: 'Состояние', icon: 'pulse' },
  { href: '/chat', title: 'Диалог', icon: 'sparkles' },
] as const;

// В react-native-web Pressable отдаёт ещё и hovered, в типах RN его нет
type WebPressState = { pressed: boolean; hovered?: boolean };

function Sidebar() {
  const { colors } = useTheme();
  const { user } = useAuthContext();
  const pathname = usePathname();

  const itemStyle = (active: boolean) => ({ pressed, hovered }: WebPressState) => [
    styles.navItem,
    active && { backgroundColor: colors.cardBackground },
    !active && (hovered || pressed) && { backgroundColor: colors.paperLine },
  ];

  return (
    <View style={[styles.sidebar, { borderRightColor: colors.border }]}>
      <View style={styles.brand}>
        <Text style={[styles.brandName, { color: colors.text }]}>Nous</Text>
        <Text style={[styles.brandGreek, { color: colors.textSecondary }]}>νοῦς</Text>
      </View>

      <View style={styles.nav}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              onPress={() => router.navigate(item.href)}
              style={itemStyle(active) as any}
              accessibilityRole="link"
            >
              <Ionicons
                name={active ? item.icon : `${item.icon}-outline`}
                size={20}
                color={active ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.navLabel, { color: active ? colors.text : colors.textSecondary }, active && styles.navLabelActive]}>
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => router.navigate('/profile')}
        style={itemStyle(pathname === '/profile') as any}
        accessibilityRole="link"
      >
        <View style={[styles.avatar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Ionicons name="person" size={16} color={colors.primary} />
        </View>
        <View style={styles.profileText}>
          <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>{user?.name || 'Профиль'}</Text>
          {!!user?.email && (
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]} numberOfLines={1}>{user.email}</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

// Гость демо-режима видит, что это песочница и когда она удалится
function DemoBanner({ expiresAt, onExit }: { expiresAt?: string | null; onExit: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const hoursLeft = expiresAt
    ? Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3_600_000))
    : null;
  return (
    <View style={[styles.demoBanner, { backgroundColor: colors.primary, paddingTop: insets.top + 6 }]}>
      <Text style={[styles.demoBannerText, { color: colors.background }]} numberOfLines={1}>
        Демо-песочница{hoursLeft ? ` · удалится через ${hoursLeft} ч` : ''}
      </Text>
      <Pressable onPress={onExit} accessibilityRole="button">
        <Text style={[styles.demoBannerText, styles.demoBannerExit, { color: colors.background }]}>Выйти</Text>
      </Pressable>
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
const SIDEBAR_BREAKPOINT = 1100;
const SIDEBAR_WIDTH = 248;
const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  demoBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  demoBannerExit: {
    textDecorationLine: 'underline',
  },
  webOuter: {
    flex: 1,
    alignItems: 'center',
  },
  webRow: {
    flex: 1,
    flexDirection: 'row',
  },
  webColumn: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_COLUMN_WIDTH,
    overflow: 'hidden',
  },
  webColumnBordered: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 20,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 28,
  },
  brandName: {
    fontFamily: serif,
    fontSize: 28,
    letterSpacing: 1,
  },
  brandGreek: {
    fontFamily: serif,
    fontSize: 15,
    fontStyle: 'italic',
  },
  nav: {
    flex: 1,
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navLabel: {
    fontSize: 15,
  },
  navLabelActive: {
    fontWeight: '600',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 12,
    marginTop: 1,
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

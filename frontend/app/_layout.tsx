import React, { useState, useEffect, createContext, useContext } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Platform, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import LoginScreen, { useAuth, User, authStorage } from './auth';
import { ThemeProvider, useTheme } from './theme';

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
  
  // Минимальная высота tab bar
  // bottomPadding только для home indicator, не больше
  const isWeb = Platform.OS === 'web';
  const bottomPadding = isWeb ? Math.min(insets.bottom, 4) : Math.min(insets.bottom, 20);
  const tabBarHeight = 50 + bottomPadding;
  
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
          }}
        />
        <Tabs.Screen
          name="theme"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline/index"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline/hooks"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline/types"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline/database"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline/syncService"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline/notesRepository"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_offline/checklistsRepository"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="_components"
          options={{
            href: null,
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
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B7355" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <SafeAreaProvider>
        <LoginScreen onLogin={auth.reload} />
      </SafeAreaProvider>
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
        <AppTabs />
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
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

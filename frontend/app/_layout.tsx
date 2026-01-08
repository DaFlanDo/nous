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
  
  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar, 
            { 
              backgroundColor: colors.background, 
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
              height: 64 + Math.max(insets.bottom, 10),
            }
          ],
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: styles.tabBarLabel,
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
          name="hooks"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="utils"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="components"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="+html"
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
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 34 : 10,
    paddingTop: 10,
    elevation: 8,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: -2 },
  },
  tabBarBg: {
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});

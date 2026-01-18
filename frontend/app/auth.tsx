import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

WebBrowser.maybeCompleteAuthSession();

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

// Ключи для AsyncStorage
const AUTH_TOKEN_KEY = '@nous_auth_token';
const USER_KEY = '@nous_user';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// Функции для работы с авторизацией
// iOS PWA может очищать AsyncStorage, поэтому дублируем в localStorage
export const authStorage = {
  async getToken(): Promise<string | null> {
    try {
      // Сначала пробуем AsyncStorage
      let token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      
      // Fallback на localStorage для iOS PWA
      if (!token && Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        token = localStorage.getItem(AUTH_TOKEN_KEY);
        // Если нашли в localStorage, восстанавливаем в AsyncStorage
        if (token) {
          await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
        }
      }
      
      return token;
    } catch {
      // Последняя попытка - только localStorage
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(AUTH_TOKEN_KEY);
      }
      return null;
    }
  },

  async getUser(): Promise<User | null> {
    try {
      let userStr = await AsyncStorage.getItem(USER_KEY);
      
      // Fallback на localStorage для iOS PWA
      if (!userStr && Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        userStr = localStorage.getItem(USER_KEY);
        if (userStr) {
          await AsyncStorage.setItem(USER_KEY, userStr);
        }
      }
      
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const userStr = localStorage.getItem(USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
      }
      return null;
    }
  },

  async setAuth(token: string, user: User): Promise<void> {
    // Сохраняем в оба хранилища для надёжности
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    
    // Дублируем в localStorage для iOS PWA
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  },

  async clearAuth(): Promise<void> {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    
    // Очищаем и localStorage
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  },
};

// Хук для авторизации
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Загрузка сохранённой авторизации при старте
  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [token, user] = await Promise.all([
        authStorage.getToken(),
        authStorage.getUser(),
      ]);

      if (token && user) {
        // Если офлайн и есть токен - доверяем ему
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setState({
            user,
            token,
            isLoading: false,
            isAuthenticated: true,
          });
          return;
        }

        // Проверяем валидность токена только онлайн
        try {
          const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            setState({
              user,
              token,
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          }
        } catch (fetchError) {
          // Если ошибка сети - оставляем токен
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setState({
              user,
              token,
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          }
        }
      }

      // Токен невалидный или отсутствует
      await authStorage.clearAuth();
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Error loading auth:', error);
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  };

  const signIn = async (idToken: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();
      await authStorage.setAuth(data.access_token, data.user);

      setState({
        user: data.user,
        token: data.access_token,
        isLoading: false,
        isAuthenticated: true,
      });

      return true;
    } catch (error) {
      console.error('Sign in error:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Authentication failed');
      }

      const data = await response.json();
      await authStorage.setAuth(data.access_token, data.user);

      setState({
        user: data.user,
        token: data.access_token,
        isLoading: false,
        isAuthenticated: true,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Sign in error:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return { success: false, error: error.message };
    }
  };

  const registerWithEmail = async (email: string, password: string, name: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Registration failed');
      }

      const data = await response.json();
      await authStorage.setAuth(data.access_token, data.user);

      setState({
        user: data.user,
        token: data.access_token,
        isLoading: false,
        isAuthenticated: true,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Register error:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      await authStorage.clearAuth();
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return {
    ...state,
    signIn,
    signInWithEmail,
    registerWithEmail,
    signOut,
    reload: loadStoredAuth,
  };
}

// Компонент экрана входа
export default function LoginScreen({ onLogin }: { onLogin?: () => void }) {
  const { colors, isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: Platform.select({
      web: `${window.location.origin}`,
      default: undefined,
    }),
  });

  const auth = useAuth();

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      handleGoogleSignIn(id_token);
    } else if (response?.type === 'error') {
      setError('Ошибка авторизации Google');
      setIsLoading(false);
    }
  }, [response]);

  const handleGoogleSignIn = async (idToken: string) => {
    setIsLoading(true);
    setError(null);

    const success = await auth.signIn(idToken);
    if (success) {
      onLogin?.();
    } else {
      setError('Не удалось войти. Попробуйте ещё раз.');
    }
    
    setIsLoading(false);
  };

  const handleGooglePress = () => {
    setError(null);
    setIsLoading(true);
    promptAsync();
  };

  const handleEmailAuth = async () => {
    setError(null);
    setIsLoading(true);

    if (!email || !password) {
      setError('Заполните все поля');
      setIsLoading(false);
      return;
    }

    if (mode === 'register' && !name) {
      setError('Введите ваше имя');
      setIsLoading(false);
      return;
    }

    let result;
    if (mode === 'login') {
      result = await auth.signInWithEmail(email, password);
    } else {
      result = await auth.registerWithEmail(email, password, name);
    }

    if (result.success) {
      onLogin?.();
    } else {
      setError(result.error || 'Произошла ошибка');
    }

    setIsLoading(false);
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Логотип и название */}
          <View style={styles.header}>
            <View style={[styles.logoContainer, { backgroundColor: isDark ? colors.surface : '#F5F0E8' }]}>
              <Ionicons name="leaf" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Nous</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>νοῦς</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Пространство для мыслей{'\n'}и рефлексии
            </Text>
          </View>

          {/* Форма входа/регистрации */}
          <View style={styles.formContainer}>
            {mode === 'register' && (
              <View style={[styles.inputContainer, { backgroundColor: colors.cardBackground, borderColor: isDark ? colors.border : '#E8E1D5' }]}>
                <Ionicons name="person-outline" size={20} color={colors.primary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Имя"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  editable={!isLoading}
                />
              </View>
            )}

            <View style={[styles.inputContainer, { backgroundColor: colors.cardBackground, borderColor: isDark ? colors.border : '#E8E1D5' }]}>
              <Ionicons name="mail-outline" size={20} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                inputMode="email"
                editable={!isLoading}
                // @ts-ignore - web attributes
                name="email"
                id="email"
              />
            </View>

            <View style={[styles.inputContainer, { backgroundColor: colors.cardBackground, borderColor: isDark ? colors.border : '#E8E1D5' }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Пароль"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                editable={!isLoading}
                // @ts-ignore - web attributes
                name="password"
                id="password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons 
                  name={showPassword ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color={colors.primary} 
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.emailButton, { backgroundColor: colors.primary }, isLoading && styles.buttonDisabled]}
              onPress={handleEmailAuth}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.emailButtonText, { color: colors.background }]}>
                  {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={toggleMode}
              disabled={isLoading}
              style={styles.toggleModeButton}
            >
              <Text style={[styles.toggleModeText, { color: colors.primary }]}>
                {mode === 'login' 
                  ? 'Нет аккаунта? Зарегистрируйтесь' 
                  : 'Уже есть аккаунт? Войдите'}
              </Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: isDark ? colors.border : '#E8E1D5' }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>или</Text>
              <View style={[styles.dividerLine, { backgroundColor: isDark ? colors.border : '#E8E1D5' }]} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, { backgroundColor: colors.cardBackground, borderColor: isDark ? colors.border : '#E8E1D5' }, (!request || isLoading) && styles.buttonDisabled]}
              onPress={handleGooglePress}
              disabled={!request || isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Image
                    source={{ uri: 'https://www.google.com/favicon.ico' }}
                    style={styles.googleIcon}
                  />
                  <Text style={[styles.googleButtonText, { color: colors.text }]}>Войти через Google</Text>
                </>
              )}
            </TouchableOpacity>

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
              Входя в приложение, вы соглашаетесь с{'\n'}
              условиями использования
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0EBE3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 40,
    fontWeight: '300',
    color: '#5D4E3A',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  subtitle: {
    fontSize: 18,
    color: '#C4B8A8',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    color: '#8B7355',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E2D9',
    height: 54,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#5D4E3A',
  },
  eyeIcon: {
    padding: 4,
  },
  emailButton: {
    backgroundColor: '#8B7355',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  emailButtonText: {
    color: '#FAF8F5',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleModeButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleModeText: {
    color: '#8B7355',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E8E2D9',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#C4B8A8',
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E8E2D9',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5D4E3A',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  privacyText: {
    fontSize: 12,
    color: '#A89F91',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
});
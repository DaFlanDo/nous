import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark';

interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryLight: string;
  accent: string;
  error: string;
  success: string;
  cardBackground: string;
  inputBackground: string;
  shadow: string;
  paperLine: string;
  modalOverlay: string;
}

const lightTheme: ThemeColors = {
  background: '#F5F1EB',
  surface: '#FFFFFF',
  text: '#2C2416',
  textSecondary: '#6B5E4F',
  border: '#D4C5B0',
  primary: '#8B7355',
  primaryLight: '#A69278',
  accent: '#D4A574',
  error: '#C84B31',
  success: '#6B8E23',
  cardBackground: '#FFFBF5',
  inputBackground: '#FFFFFF',
  shadow: 'rgba(0, 0, 0, 0.1)',
  paperLine: 'rgba(200, 185, 165, 0.3)',
  modalOverlay: 'rgba(0, 0, 0, 0.5)',
};

const darkTheme: ThemeColors = {
  background: '#121212',        // Глубокий графит вместо черного
  surface: '#1E1E1E',           // Поверхности чуть светлее для elevation
  text: '#F4F4F5',              // Молочный белый (87% белого) - мягко для глаз
  textSecondary: '#A1A1AA',     // Приглушенный серый (60% белого)
  border: '#27272a',            // Мягкие границы
  primary: '#C5A572',           // Десатурированный и осветленный беж
  primaryLight: '#D4B989',      // Светлее для hover/active
  accent: '#E8CFA0',            // Мягкий пастельный акцент
  error: '#F87171',             // Смягченный красный
  success: '#A3C585',           // Приглушенный зеленый
  cardBackground: '#27272a',    // "Островки" контента - светлее фона
  inputBackground: '#1E1E1E',   // Поля ввода
  shadow: 'rgba(0, 0, 0, 0.4)',
  paperLine: 'rgba(255, 255, 255, 0.08)',  // Едва заметные линии
  modalOverlay: 'rgba(0, 0, 0, 0.75)',
};

interface ThemeContextType {
  theme: Theme;
  colors: ThemeColors;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_STORAGE_KEY = '@nous_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const colors = theme === 'light' ? lightTheme : darkTheme;
  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

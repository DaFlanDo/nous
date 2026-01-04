import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuthContext } from './_layout';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface StateMetrics {
  dopamine: number;
  serotonin: number;
  gaba: number;
  noradrenaline: number;
  cortisol: number;
  testosterone: number;
  pfc_activity: number;
  focus: number;
  energy: number;
  motivation: number;
}

interface StateRecord {
  id: string;
  metrics: StateMetrics;
  analysis: string;
  created_at: string;
}

const NEURO_LABELS: Record<string, { name: string; icon: string; color: string; description: string }> = {
  dopamine: { name: 'Дофамин', icon: 'flash', color: '#F59E0B', description: 'Мотивация, награда' },
  serotonin: { name: 'Серотонин', icon: 'sunny', color: '#10B981', description: 'Настроение, спокойствие' },
  gaba: { name: 'ГАМК', icon: 'water', color: '#6366F1', description: 'Расслабление' },
  noradrenaline: { name: 'Норадреналин', icon: 'pulse', color: '#EF4444', description: 'Бдительность' },
  cortisol: { name: 'Кортизол', icon: 'alert-circle', color: '#8B5CF6', description: 'Стресс' },
  testosterone: { name: 'Тестостерон', icon: 'fitness', color: '#EC4899', description: 'Уверенность' },
};

const COGNITIVE_LABELS: Record<string, { name: string; icon: string; color: string; description: string }> = {
  pfc_activity: { name: 'ПФК', icon: 'bulb', color: '#14B8A6', description: 'Префронтальная кора' },
  focus: { name: 'Фокус', icon: 'eye', color: '#3B82F6', description: 'Концентрация' },
  energy: { name: 'Энергия', icon: 'battery-charging', color: '#F97316', description: 'Общий уровень' },
  motivation: { name: 'Мотивация', icon: 'rocket', color: '#84CC16', description: 'Желание действовать' },
};

const MetricBar = ({ 
  label, 
  value, 
  icon, 
  color, 
  description 
}: { 
  label: string; 
  value: number; 
  icon: string; 
  color: string;
  description: string;
}) => {
  const percentage = (value / 10) * 100;
  
  return (
    <View style={styles.metricContainer}>
      <View style={styles.metricHeader}>
        <View style={styles.metricLabel}>
          <View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}>
            <Ionicons name={icon as any} size={16} color={color} />
          </View>
          <View>
            <Text style={styles.metricName}>{label}</Text>
            <Text style={styles.metricDescription}>{description}</Text>
          </View>
        </View>
        <Text style={[styles.metricValue, { color }]}>{value.toFixed(1)}</Text>
      </View>
      <View style={styles.barContainer}>
        <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: color }]} />
        <View style={styles.barMarkers}>
          {[0, 2, 4, 6, 8, 10].map(mark => (
            <View key={mark} style={styles.barMarker} />
          ))}
        </View>
      </View>
    </View>
  );
};

const HistoryItem = ({ record, isFirst }: { record: StateRecord; isFirst: boolean }) => {
  const [expanded, setExpanded] = useState(isFirst);
  
  return (
    <TouchableOpacity 
      style={styles.historyItem} 
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.historyHeader}>
        <Text style={styles.historyDate}>
          {format(new Date(record.created_at), 'd MMMM, HH:mm', { locale: ru })}
        </Text>
        <Ionicons 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={18} 
          color="#A89F91" 
        />
      </View>
      
      {expanded && (
        <View style={styles.historyContent}>
          {record.analysis && (
            <Text style={styles.historyAnalysis}>{record.analysis}</Text>
          )}
          <View style={styles.historyMetrics}>
            {Object.entries(NEURO_LABELS).map(([key, info]) => (
              <View key={key} style={styles.miniMetric}>
                <Ionicons name={info.icon as any} size={12} color={info.color} />
                <Text style={styles.miniMetricValue}>
                  {(record.metrics[key as keyof StateMetrics] || 5).toFixed(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

export default function StateScreen() {
  const { token } = useAuthContext();
  const [latestState, setLatestState] = useState<StateRecord | null>(null);
  const [history, setHistory] = useState<StateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const [latestRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/api/states/latest`, { headers }),
        fetch(`${API_URL}/api/states?limit=20`, { headers }),
      ]);

      if (latestRes.ok) {
        const data = await latestRes.json();
        setLatestState(data);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Error fetching state:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const analyzeFromNotes = async () => {
    setAnalyzing(true);
    try {
      const response = await fetch(`${API_URL}/api/states/analyze`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error analyzing:', error);
    } finally {
      setAnalyzing(false);
    }
  };

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
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B7355" />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Состояние</Text>
            <Text style={styles.greekAccent}>σῶμα</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            {latestState 
              ? `Обновлено ${format(new Date(latestState.created_at), 'd MMM, HH:mm', { locale: ru })}`
              : 'Нет данных'
            }
          </Text>
        </View>

        {/* Кнопка анализа */}
        <TouchableOpacity 
          style={styles.analyzeBtn} 
          onPress={analyzeFromNotes}
          disabled={analyzing}
          activeOpacity={0.7}
        >
          {analyzing ? (
            <ActivityIndicator size="small" color="#8B7355" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#8B7355" />
              <Text style={styles.analyzeBtnText}>Проанализировать записи</Text>
            </>
          )}
        </TouchableOpacity>

        {latestState && latestState.analysis && (
          <View style={styles.analysisCard}>
            <Ionicons name="chatbubble-outline" size={18} color="#8B7355" />
            <Text style={styles.analysisText}>{latestState.analysis}</Text>
          </View>
        )}

        {/* Нейромедиаторы */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Нейромедиаторы</Text>
          {Object.entries(NEURO_LABELS).map(([key, info]) => (
            <MetricBar
              key={key}
              label={info.name}
              value={latestState?.metrics[key as keyof StateMetrics] || 5}
              icon={info.icon}
              color={info.color}
              description={info.description}
            />
          ))}
        </View>

        {/* Когнитивные */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Когнитивные функции</Text>
          {Object.entries(COGNITIVE_LABELS).map(([key, info]) => (
            <MetricBar
              key={key}
              label={info.name}
              value={latestState?.metrics[key as keyof StateMetrics] || 5}
              icon={info.icon}
              color={info.color}
              description={info.description}
            />
          ))}
        </View>

        {/* История */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>История</Text>
            {history.map((record, index) => (
              <HistoryItem key={record.id} record={record} isFirst={index === 0} />
            ))}
          </View>
        )}
      </ScrollView>
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
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#5D4E3A',
    letterSpacing: -0.5,
  },
  greekAccent: {
    fontSize: 16,
    color: '#C4B8A8',
    fontStyle: 'italic',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#A89F91',
    marginTop: 4,
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0EBE3',
    marginHorizontal: 24,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  analyzeBtnText: {
    color: '#8B7355',
    fontSize: 15,
    fontWeight: '500',
  },
  analysisCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  analysisText: {
    flex: 1,
    color: '#5D4E3A',
    fontSize: 14,
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#5D4E3A',
    marginBottom: 16,
  },
  metricContainer: {
    marginBottom: 16,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#5D4E3A',
  },
  metricDescription: {
    fontSize: 12,
    color: '#A89F91',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  barContainer: {
    height: 8,
    backgroundColor: '#F0EBE3',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barMarkers: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  barMarker: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  historyItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyDate: {
    fontSize: 14,
    color: '#5D4E3A',
    fontWeight: '500',
  },
  historyContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE3',
  },
  historyAnalysis: {
    fontSize: 13,
    color: '#8B7355',
    lineHeight: 20,
    marginBottom: 12,
  },
  historyMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EBE3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  miniMetricValue: {
    fontSize: 12,
    color: '#5D4E3A',
    fontWeight: '500',
  },
});

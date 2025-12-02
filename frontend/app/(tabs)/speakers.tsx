import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { AUDIO_BACKEND_URL } from '../../config';

type Speaker = {
  id: number;
  direction: string;
  duration: number;
  text: string;
  start_time: number;
  end_time: number;
  spatial_label?: string;
};

export default function SpeakerSeparationScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [error, setError] = useState('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        setHasPermission(status === 'granted');
      } catch (err) {
        console.error('Failed to get audio permissions', err);
        setHasPermission(false);
      }
    })();
  }, []);

  const startRecording = async () => {
    try {
      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      setError('');
      setSpeakers([]);
    } catch (err) {
      console.error('Failed to start recording', err);
      setError('Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    if (uri) {
      await processAudio(uri);
    }
  };

  const processAudio = async (audioUri: string) => {
    setIsProcessing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: audioUri,
        name: 'recording.wav',
        type: 'audio/wav',
      } as any);

      const response = await fetch(AUDIO_BACKEND_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const json = await response.json();
      if (json.error) {
        throw new Error(json.error);
      }

      setSpeakers(json.speakers || []);
    } catch (err) {
      console.error('Audio processing error:', err);
      setError((err as Error)?.message || 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const getDirectionColor = (direction: string) => {
    switch (direction.toLowerCase()) {
      case 'left':
        return '#3B82F6'; // Blue
      case 'right':
        return '#10B981'; // Green
      case 'front':
        return '#F59E0B'; // Amber
      case 'back':
        return '#EF4444'; // Red
      case 'center':
        return '#8B5CF6'; // Purple
      default:
        return '#6B7280'; // Gray
    }
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction.toLowerCase()) {
      case 'left':
        return '←';
      case 'right':
        return '→';
      case 'front':
        return '↑';
      case 'back':
        return '↓';
      case 'center':
        return '•';
      default:
        return '?';
    }
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Requesting microphone access…</Text>
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Microphone access is required</Text>
        <Text style={styles.subtitle}>
          Enable microphone permissions in settings and relaunch the app.
        </Text>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Audio recording isn't available on Expo web.</Text>
        <Text style={[styles.subtitle, { marginTop: 8 }]}>
          Open this project in Expo Go on iOS/Android to use speaker separation.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.appName}>Speaker Separation</Text>
          <Text style={styles.headerSubtitle}>
            Spatial audio captioning with AI-powered speaker identification
          </Text>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={[isRecording ? '#DC2626' : '#4338CA', '#0F172A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroRow}>
              <View>
                <Text style={styles.heroTitle}>
                  {isRecording ? 'Recording...' : isProcessing ? 'Processing...' : 'Ready'}
                </Text>
                <Text style={styles.heroSubtitle}>
                  {isRecording
                    ? 'Capturing audio from multiple speakers'
                    : isProcessing
                    ? 'Separating speakers and analyzing spatial positions'
                    : 'Tap record to start capturing audio'}
                </Text>
              </View>
              <View style={[styles.statusPill, isRecording && styles.statusPillActive]}>
                <View style={[styles.statusPillDot, isRecording && styles.statusPillDotActive]} />
                <Text style={[styles.statusPillText, isRecording && styles.statusPillTextActive]}>
                  {isRecording ? 'Live' : 'Standby'}
                </Text>
              </View>
            </View>

            {speakers.length > 0 && (
              <View style={styles.heroStatsRow}>
                <View style={styles.heroStatItem}>
                  <Text style={styles.heroStatLabel}>Speakers detected</Text>
                  <Text style={styles.heroStatValue}>{speakers.length}</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonActive,
              (isProcessing || !hasPermission) && styles.disabledButton,
            ]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isProcessing || !hasPermission}
            activeOpacity={0.85}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FDF4FF" />
            ) : (
              <Text style={styles.recordButtonText}>
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {speakers.length > 0 && (
          <View style={styles.speakersCard}>
            <Text style={styles.sectionLabel}>Detected Speakers</Text>
            <ScrollView style={styles.speakersList} showsVerticalScrollIndicator={false}>
              {speakers.map((speaker) => {
                const directionColor = getDirectionColor(speaker.direction);
                const label = speaker.spatial_label || `Speaker ${speaker.id + 1}`;

                return (
                  <View key={speaker.id} style={styles.speakerBubble}>
                    <View style={styles.speakerHeader}>
                      <View
                        style={[
                          styles.directionBadge,
                          { backgroundColor: `${directionColor}20`, borderColor: directionColor },
                        ]}
                      >
                        <Text style={[styles.directionIcon, { color: directionColor }]}>
                          {getDirectionIcon(speaker.direction)}
                        </Text>
                        <Text style={[styles.directionText, { color: directionColor }]}>
                          {speaker.direction}
                        </Text>
                      </View>
                      <Text style={styles.speakerDuration}>
                        {speaker.duration.toFixed(1)}s
                      </Text>
                    </View>
                    <Text style={styles.speakerLabel}>{label}</Text>
                    {speaker.text && (
                      <Text style={styles.speakerText}>{speaker.text}</Text>
                    )}
                    <Text style={styles.speakerTime}>
                      {speaker.start_time.toFixed(1)}s - {speaker.end_time.toFixed(1)}s
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {!isRecording && !isProcessing && speakers.length === 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoText}>
              • Record audio from multiple speakers{'\n'}
              • AI separates and identifies each speaker{'\n'}
              • Spatial labels show speaker positions{'\n'}
              • Live captions appear for each speaker
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Connected to: {AUDIO_BACKEND_URL.replace('http://', '').replace('https://', '')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#010314',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 0,
    paddingBottom: Platform.OS === 'android' ? 20 : 12,
  },
  centered: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  glowOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(79,70,229,0.35)',
    top: -60,
    right: -40,
    opacity: 0.4,
  },
  glowTwo: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(14,165,233,0.25)',
    bottom: 80,
    left: -60,
    opacity: 0.3,
  },
  header: {
    marginTop: 8,
    marginBottom: 12,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#A5B4FC',
  },
  heroCard: {
    marginBottom: 14,
  },
  heroGradient: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontSize: 20,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  heroSubtitle: {
    marginTop: 4,
    color: '#E0E7FF',
    fontSize: 13,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  statusPillActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  statusPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(248,250,252,0.55)',
    marginRight: 6,
  },
  statusPillDotActive: {
    backgroundColor: '#7C3AED',
  },
  statusPillText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: '#EEF2FF',
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  heroStatItem: {
    flex: 1,
  },
  heroStatLabel: {
    color: '#CBD5F5',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroStatValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E5E7EB',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  controlsRow: {
    marginTop: 12,
  },
  recordButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#4338CA',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 6,
  },
  recordButtonActive: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  recordButtonText: {
    color: '#FDF4FF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: {
    fontSize: 14,
    color: '#FCA5A5',
  },
  speakersCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
    backgroundColor: 'rgba(15,23,42,0.8)',
    maxHeight: 400,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#94A3B8',
    marginBottom: 12,
    fontWeight: '600',
  },
  speakersList: {
    maxHeight: 350,
  },
  speakerBubble: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(4,6,24,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
  },
  speakerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  directionIcon: {
    fontSize: 14,
    marginRight: 6,
    fontWeight: '700',
  },
  directionText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  speakerDuration: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  speakerLabel: {
    fontSize: 16,
    color: '#F8FAFC',
    fontWeight: '600',
    marginBottom: 4,
  },
  speakerText: {
    fontSize: 14,
    color: '#E5E7EB',
    lineHeight: 20,
    marginBottom: 6,
  },
  speakerTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  infoCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(4,6,24,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.8)',
  },
  infoTitle: {
    fontSize: 16,
    color: '#F8FAFC',
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 22,
  },
  footer: {
    marginTop: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#4B5563',
  },
});


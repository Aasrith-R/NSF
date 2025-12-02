import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { BACKEND_URL } from '../../config';

type Detection = {
  label: string;
  distance: number;
  direction: string;
  risk: string;
};

export default function DetectionScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isSending, setIsSending] = useState(false);
  const [alertText, setAlertText] = useState('');
  const [error, setError] = useState('');
  const [cameraType, setCameraType] = useState<'back' | 'front'>('back');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const cameraRef = useRef<CameraView | null>(null);
  const detectionLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission?.granted && isDetecting) {
      setIsDetecting(false);
    }
  }, [permission?.granted, isDetecting]);

  const speakAlert = (text: string) => {
    if (!text) return;
    Speech.stop();
    Speech.speak(text, {
      language: 'en-US',
      rate: 1.0,
      pitch: 1.0,
    });
  };

  const captureAndSend = async () => {
    if (!cameraRef.current || isSending) return;

    setError('');
    setIsSending(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
        skipProcessing: true,
      });

      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      } as any);

      const response = await fetch(BACKEND_URL, {
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
      const parsedDetections: Detection[] = (Array.isArray(json.objects) ? json.objects : [])
        .map((item: Partial<Detection>) => ({
          label: item?.label ?? 'Unknown',
          distance: Number(item?.distance ?? 0),
          direction: item?.direction ?? 'center',
          risk: item?.risk ?? 'clear',
        }))
        .sort((a: Detection, b: Detection) => a.distance - b.distance);

      setDetections(parsedDetections);

      const newAlert = json.alert_text ?? '';
      setAlertText(newAlert);
      speakAlert(newAlert);
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message ?? 'Unable to contact backend.');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!isDetecting || !permission?.granted) {
      if (detectionLoopRef.current) {
        clearTimeout(detectionLoopRef.current);
        detectionLoopRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const runCycle = async () => {
      if (cancelled) return;
      await captureAndSend();
      if (cancelled || !isDetecting) return;
      detectionLoopRef.current = setTimeout(runCycle, 1500);
    };

    runCycle();

    return () => {
      cancelled = true;
      if (detectionLoopRef.current) {
        clearTimeout(detectionLoopRef.current);
        detectionLoopRef.current = null;
      }
    };
  }, [isDetecting, permission?.granted]);

  const toggleCameraType = () => {
    setCameraType((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const handleToggleDetection = async () => {
    if (!permission) {
      await requestPermission();
      return;
    }

    if (!permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        return;
      }
    }

    setIsDetecting((prev) => !prev);
  };

  const getRiskColors = (risk: string) => {
    switch (risk) {
      case 'danger':
        return { backgroundColor: 'rgba(248,113,113,0.15)', color: '#FCA5A5' };
      case 'caution':
        return { backgroundColor: 'rgba(251,191,36,0.2)', color: '#FACC15' };
      default:
        return { backgroundColor: 'rgba(52,211,153,0.15)', color: '#6EE7B7' };
    }
  };

  const nearestDetection = detections[0];
  const hasDetections = detections.length > 0;

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Camera view isn’t available on Expo web.</Text>
        <Text style={[styles.subtitle, { marginTop: 8 }]}>Open this project in Expo Go on iOS/Android or run it in a simulator to access the camera.</Text>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Requesting camera access…</Text>
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Camera access is required</Text>
        <Text style={styles.subtitle}>Enable camera permissions in settings and relaunch the app.</Text>
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
          <Text style={styles.appName}>NSF Vision Assistant</Text>
          <Text style={styles.headerSubtitle}>Guided mobility with contextual awareness</Text>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={[isDetecting ? '#4338CA' : '#1D4ED8', '#0F172A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroRow}>
              <View>
                <Text style={styles.heroTitle}>{isDetecting ? 'Detection live' : 'Detection idle'}</Text>
                <Text style={styles.heroSubtitle}>
                  {isDetecting ? 'Frames analyzed every 1.5s' : 'Tap start to begin scanning'}
                </Text>
              </View>
              <View style={[styles.statusPill, isDetecting && styles.statusPillActive]}>
                <View style={[styles.statusPillDot, isDetecting && styles.statusPillDotActive]} />
                <Text style={[styles.statusPillText, isDetecting && styles.statusPillTextActive]}>
                  {isDetecting ? 'Live' : 'Standby'}
                </Text>
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>Nearest object</Text>
                <Text style={styles.heroStatValue}>
                  {nearestDetection ? `${nearestDetection.distance.toFixed(1)} m` : '—'}
                </Text>
              </View>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>Direction</Text>
                <Text style={styles.heroStatValue}>
                  {nearestDetection ? nearestDetection.direction : '—'}
                </Text>
              </View>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>Risk level</Text>
                <Text style={styles.heroStatValue}>
                  {nearestDetection ? nearestDetection.risk : '—'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.cameraContainer}>
          <CameraView
            ref={(node) => {
              cameraRef.current = node;
            }}
            style={styles.camera}
            facing={cameraType}
            animateShutter={false}
          >
            <View style={styles.cameraOverlay}>
              <View style={styles.focusBox} />
            </View>
            <View style={styles.cameraMetaBar}>
              <Text style={styles.cameraMetaText}>
                {cameraType === 'back' ? 'Rear camera active' : 'Front camera active'}
              </Text>
              <View style={styles.cameraMetaChip}>
                <View style={[styles.cameraMetaDot, isDetecting && styles.cameraMetaDotActive]} />
                <Text style={styles.cameraMetaChipText}>{isDetecting ? 'Streaming' : 'Paused'}</Text>
              </View>
            </View>
          </CameraView>
        </View>

        <View style={styles.infoCard}>
          {isDetecting && (
            <View style={styles.detectionBadge}>
              <View style={[styles.detectionDot, isSending && styles.detectionDotActive]} />
              <Text style={styles.detectionBadgeText}>
                {isSending ? 'Capturing frame…' : 'Continuous detection active'}
              </Text>
            </View>
          )}
          {isSending ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#C4B5FD" />
              <Text style={styles.statusText}>Analyzing scene…</Text>
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : alertText ? (
            <>
              <Text style={styles.sectionLabel}>Latest guidance</Text>
              <Text style={styles.alertText}>{alertText}</Text>
            </>
          ) : (
            <Text style={styles.placeholderText}>
              No alerts yet. Point your camera and tap Start detection to hear guidance.
            </Text>
          )}
        </View>

        {hasDetections && (
          <View style={styles.detectionsCard}>
            <Text style={styles.sectionLabel}>Objects nearby</Text>
            {detections.slice(0, 3).map((item) => {
              const { backgroundColor, color } = getRiskColors(item.risk);
              return (
                <View key={`${item.label}-${item.distance}`} style={styles.detectionRow}>
                  <View>
                    <Text style={styles.detectionLabel}>{item.label}</Text>
                    <Text style={styles.detectionSubText}>
                      {item.direction} • {item.distance.toFixed(1)} m
                    </Text>
                  </View>
                  <View style={[styles.riskBadge, { backgroundColor }]}>
                    <Text style={[styles.riskBadgeText, { color }]}>{item.risk}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, isSending && styles.disabledButton]}
            onPress={toggleCameraType}
            disabled={isSending}
          >
            <Text style={styles.secondaryButtonText}>
              {cameraType === 'back' ? 'Switch to front' : 'Switch to back'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, isDetecting && styles.primaryButtonActive]}
            onPress={handleToggleDetection}
            disabled={isSending && !isDetecting}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {isDetecting ? 'Stop detection' : isSending ? 'Starting…' : 'Start detection'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Connected to: {BACKEND_URL.replace('http://', '').replace('https://', '')}
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
    paddingRight: 12,
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
  cameraContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.8)',
    backgroundColor: '#020617',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 8,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusBox: {
    width: '65%',
    height: '45%',
    borderWidth: 2,
    borderColor: 'rgba(99,102,241,0.85)',
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.25)',
  },
  cameraMetaBar: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(2,6,23,0.65)',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.35)',
  },
  cameraMetaText: {
    color: '#E0E7FF',
    fontSize: 13,
  },
  cameraMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79,70,229,0.15)',
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  cameraMetaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(248,250,252,0.5)',
    marginRight: 6,
  },
  cameraMetaDotActive: {
    backgroundColor: '#A78BFA',
  },
  cameraMetaChipText: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '500',
  },
  infoCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(4,6,24,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.8)',
  },
  detectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  detectionDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    backgroundColor: '#7C3AED',
    opacity: 0.4,
  },
  detectionDotActive: {
    opacity: 1,
  },
  detectionBadgeText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#94A3B8',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 18,
    color: '#F8FAFC',
    lineHeight: 24,
  },
  placeholderText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#E2E8F0',
  },
  errorText: {
    fontSize: 14,
    color: '#F97373',
  },
  detectionsCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  detectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
  },
  detectionLabel: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  detectionSubText: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  riskBadge: {
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  controlsRow: {
    flexDirection: 'row',
    columnGap: 10,
    marginTop: 12,
  },
  primaryButton: {
    flex: 1,
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
  primaryButtonActive: {
    backgroundColor: '#7C3AED',
  },
  primaryButtonText: {
    color: '#FDF4FF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
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

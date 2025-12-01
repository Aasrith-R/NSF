import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Speech from 'expo-speech';
import { supabase } from '../constants/supabaseClient';
import type { Session } from '@supabase/supabase-js';

const BACKEND_BASE = 'http://192.168.1.85:8000';
const DETECT_URL = `${BACKEND_BASE}/detect/`;
const SMART_QUERY_URL = `${BACKEND_BASE}/smart_query/`;

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
  const [userQuestion, setUserQuestion] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
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

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error && isMounted) {
        setSession(data.session ?? null);
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (isMounted) {
        setSession(newSession);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const speakAlert = (text: string) => {
    if (!text) return;
    Speech.stop();
    Speech.speak(text, {
      language: 'en-US',
      rate: 1.0,
      pitch: 1.0,
    });
  };

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }

    setAuthError('');
    setAuthLoading(true);

    try {
      if (authMode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err?.message ?? 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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

      const response = await fetch(DETECT_URL, {
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

  const handleSmartQuery = async () => {
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
      const questionToSend = userQuestion.trim() || 'What important things are in front of me and where are they?';
      formData.append('question', questionToSend);

      const response = await fetch(SMART_QUERY_URL, {
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

      const answer = (json.answer_text ?? '').trim();
      const spokenText = answer || questionToSend;
      setAlertText(spokenText);
      speakAlert(spokenText);
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message ?? 'Unable to contact backend.');
    } finally {
      setIsSending(false);
    }
  };

  const getRiskColors = (risk: string) => {
    switch (risk) {
      case 'danger':
        return { backgroundColor: 'rgba(248,113,113,0.2)', color: '#FCA5A5' };
      case 'caution':
        return { backgroundColor: 'rgba(251,191,36,0.25)', color: '#FACC15' };
      default:
        return { backgroundColor: 'rgba(52,211,153,0.2)', color: '#6EE7B7' };
    }
  };

  const nearestDetection = detections[0];
  const hasDetections = detections.length > 0;

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />

        <LinearGradient
          colors={['#010314', '#050b2b', '#020617']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.gooOne} />
        <View style={styles.gooTwo} />
        <View style={styles.gooThree} />

        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.appName}>NSF Vision Assistant</Text>
            <Text style={styles.headerSubtitle}>Sign in to access guidance</Text>
          </View>

          <BlurView intensity={90} tint="dark" style={styles.infoGlass}>
            <Text style={styles.sectionLabel}>
              {authMode === 'sign-in' ? 'Sign in' : 'Create account'}
            </Text>
            <TextInput
              style={styles.queryInput}
              placeholder="Email"
              placeholderTextColor="#64748B"
              keyboardType="email-address"
              autoCapitalize="none"
              value={authEmail}
              onChangeText={setAuthEmail}
              editable={!authLoading}
            />
            <TextInput
              style={[styles.queryInput, { marginTop: 10 }]}
              placeholder="Password"
              placeholderTextColor="#64748B"
              secureTextEntry
              value={authPassword}
              onChangeText={setAuthPassword}
              editable={!authLoading}
            />
            {!!authError && (
              <Text style={[styles.errorText, { marginTop: 8 }]}>{authError}</Text>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, authLoading && styles.disabledButton, { marginTop: 12 }]}
              onPress={handleAuthSubmit}
              disabled={authLoading}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>
                {authMode === 'sign-in'
                  ? authLoading
                    ? 'Signing in…'
                    : 'Sign in'
                  : authLoading
                    ? 'Creating…'
                    : 'Sign up'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 10, alignItems: 'center' }}
              onPress={() =>
                setAuthMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'))
              }
              disabled={authLoading}
            >
              <Text style={styles.secondaryButtonText}>
                {authMode === 'sign-in'
                  ? 'Need an account? Sign up'
                  : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Camera view isn’t available on Expo web.</Text>
        <Text style={[styles.subtitle, { marginTop: 8 }]}>
          Open this project in Expo Go on iOS/Android or run it in a simulator to access the camera.
        </Text>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.title}>Requesting camera access…</Text>
        <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 16 }} />
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

      <LinearGradient
        colors={[ '#010314', '#050b2b', '#020617' ]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.gooOne} />
      <View style={styles.gooTwo} />
      <View style={styles.gooThree} />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.appName}>NSF Vision Assistant</Text>
          <Text style={styles.headerSubtitle}>Liquid-glass guidance for confident movement</Text>
        </View>

        <View style={styles.heroWrapper}>
          <BlurView intensity={95} tint="dark" style={styles.heroGlass}>
            <LinearGradient
              colors={[isDetecting ? 'rgba(147,197,253,0.4)' : 'rgba(191,219,254,0.3)', 'rgba(248,250,252,0.05)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradientLayer}
            />
            <View style={styles.heroContent}>
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
          </BlurView>
        </View>

        <View style={styles.cameraShell}>
          <LinearGradient
            colors={['rgba(99,102,241,0.25)', 'rgba(15,23,42,0.6)']}
            style={StyleSheet.absoluteFillObject}
          />
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
            <BlurView intensity={70} tint="dark" style={styles.cameraMetaBar}>
              <Text style={styles.cameraMetaText}>
                {cameraType === 'back' ? 'Rear camera active' : 'Front camera active'}
              </Text>
              <View style={styles.cameraMetaChip}>
                <View style={[styles.cameraMetaDot, isDetecting && styles.cameraMetaDotActive]} />
                <Text style={styles.cameraMetaChipText}>{isDetecting ? 'Streaming' : 'Paused'}</Text>
              </View>
            </BlurView>
          </CameraView>
        </View>

        <BlurView intensity={80} tint="dark" style={styles.infoGlass}>
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
              <ActivityIndicator size="small" color="#F9A8D4" />
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
        </BlurView>

        {hasDetections && (
          <BlurView intensity={85} tint="dark" style={styles.detectionsGlass}>
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
          </BlurView>
        )}

        <BlurView intensity={80} tint="dark" style={styles.queryGlass}>
          <Text style={styles.sectionLabel}>Smart query</Text>
          <TextInput
            style={styles.queryInput}
            placeholder={"Ask about this scene (e.g., \"Where's the elevator?\")"}
            placeholderTextColor="#64748B"
            value={userQuestion}
            onChangeText={setUserQuestion}
            editable={!isSending}
            returnKeyType="done"
          />
        </BlurView>

        <BlurView intensity={80} tint="dark" style={styles.controlsGlass}>
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

          <TouchableOpacity
            style={[styles.secondaryButton, isSending && styles.disabledButton]}
            onPress={handleSmartQuery}
            disabled={isSending}
          >
            <Text style={styles.secondaryButtonText}>Smart query</Text>
          </TouchableOpacity>
        </BlurView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Connected to: {BACKEND_BASE.replace('http://', '').replace('https://', '')}
          </Text>
          <TouchableOpacity onPress={handleSignOut}>
            <Text style={[styles.footerText, { marginTop: 4, textDecorationLine: 'underline' }]}>Sign out</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingBottom: Platform.OS === 'android' ? 20 : 12,
  },
  centered: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  gooOne: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(99,102,241,0.35)',
    top: -80,
    left: -60,
    opacity: 0.45,
  },
  gooTwo: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(59,130,246,0.3)',
    bottom: 40,
    right: -70,
    opacity: 0.35,
  },
  gooThree: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(236,72,153,0.25)',
    bottom: 160,
    left: 40,
    opacity: 0.25,
  },
  header: {
    marginTop: 8,
    marginBottom: 14,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F5F3FF',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#C7D2FE',
  },
  heroWrapper: {
    marginBottom: 16,
  },
  heroGlass: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  heroGradientLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  heroContent: {
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
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  statusPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(248,250,252,0.6)',
    marginRight: 6,
  },
  statusPillDotActive: {
    backgroundColor: '#22D3EE',
  },
  statusPillText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: '#0EA5E9',
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  heroStatItem: {
    flex: 1,
    paddingRight: 12,
  },
  heroStatLabel: {
    color: '#CBD5F5',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroStatValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
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
  cameraShell: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    marginBottom: 16,
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
    borderColor: 'rgba(248,250,252,0.8)',
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.3)',
  },
  cameraMetaBar: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  cameraMetaText: {
    color: '#E0E7FF',
    fontSize: 13,
  },
  cameraMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.15)',
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
  infoGlass: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(2,6,23,0.55)',
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
    color: '#CBD5F5',
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#94A3B8',
    marginBottom: 6,
  },
  alertText: {
    fontSize: 18,
    color: '#F8FAFC',
    lineHeight: 24,
  },
  placeholderText: {
    fontSize: 14,
    color: '#A5B4FC',
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
    color: '#F97C7C',
  },
  detectionsGlass: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(5,8,34,0.6)',
  },
  queryGlass: {
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(15,23,42,0.65)',
  },
  detectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(148,163,184,0.08)',
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
  queryInput: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#E5E7EB',
    fontSize: 14,
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  controlsGlass: {
    borderRadius: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    flexDirection: 'row',
    columnGap: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(2,6,23,0.55)',
  },
  primaryButton: {
    flex: 1.2,
    backgroundColor: '#4338CA',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#4338CA',
    shadowOpacity: 0.4,
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
    borderColor: 'rgba(148,163,184,0.5)',
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
    marginTop: 14,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#7C8AA5',
  },
});

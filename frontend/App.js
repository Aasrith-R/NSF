import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import * as Speech from 'expo-speech';
import { BACKEND_URL } from './config';

export default function App() {
  const [hasPermission, setHasPermission] = useState('pending');
  const [isSending, setIsSending] = useState(false);
  const [alertText, setAlertText] = useState('');
  const [error, setError] = useState('');
  const [cameraType, setCameraType] = useState(CameraType.back);

  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted' ? 'granted' : 'denied');
    })();
  }, []);

  const speakAlert = (text) => {
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
      });

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
      const newAlert = json.alert_text || '';
      setAlertText(newAlert);
      if (newAlert) {
        speakAlert(newAlert);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Cannot connect to backend. Check IP and ensure backend is running.');
    } finally {
      setIsSending(false);
    }
  };

  const toggleCameraType = () => {
    setCameraType((prev) =>
      prev === CameraType.back ? CameraType.front : CameraType.back
    );
  };

  if (hasPermission === 'pending') {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.title}>Requesting camera access…</Text>
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  if (hasPermission === 'denied') {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.title}>Camera access is required</Text>
        <Text style={styles.subtitle}>
          Enable camera permissions in settings, then reopen the app.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.appName}>NSF Vision Assistant</Text>
        <Text style={styles.headerSubtitle}>Point your camera and tap Detect</Text>
      </View>

      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={styles.camera}
          type={cameraType}
          ratio="16:9"
        >
          <View style={styles.cameraOverlay}>
            <View style={styles.focusBox} />
          </View>
        </Camera>
      </View>

      <View style={styles.infoCard}>
        {isSending ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text style={styles.statusText}>Analyzing scene…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : alertText ? (
          <>
            <Text style={styles.sectionLabel}>Latest alert</Text>
            <Text style={styles.alertText}>{alertText}</Text>
          </>
        ) : (
          <Text style={styles.placeholderText}>
            No alerts yet. Point your camera at something and tap Detect.
          </Text>
        )}
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, isSending && styles.disabledButton]}
          onPress={toggleCameraType}
          disabled={isSending}
        >
          <Text style={styles.secondaryButtonText}>
            {cameraType === CameraType.back ? 'Front' : 'Back'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, isSending && styles.disabledButton]}
          onPress={captureAndSend}
          disabled={isSending}
        >
          <Text style={styles.primaryButtonText}>
            {isSending ? 'Detecting…' : 'Detect Objects'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Connected to: {BACKEND_URL.replace('http://', '').replace('https://', '')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 16 : 8,
  },
  centered: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
    color: '#9CA3AF',
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
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1120',
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
    borderColor: '#4F46E5',
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.25)',
  },
  infoCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#6B7280',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 16,
    color: '#E5E7EB',
  },
  placeholderText: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#E5E7EB',
  },
  errorText: {
    fontSize: 14,
    color: '#F97373',
  },
  controlsRow: {
    flexDirection: 'row',
    columnGap: 10,
    marginTop: 12,
  },
  primaryButton: {
    flex: 2,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.6,
  },
  footer: {
    marginTop: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#4B5563',
  },
});

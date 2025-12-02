// Backend configuration
// Update the IP address and port here when your backend server changes
const BACKEND_BASE = 'http://10.0.0.230:8001';

export const BACKEND_URL = `${BACKEND_BASE}/detect/`;
export const AUDIO_BACKEND_URL = `${BACKEND_BASE}/process-audio/`;

// Alternative: You can also set it via environment variables
// For example, if using expo-constants:
// import Constants from 'expo-constants';
// const base = Constants.expoConfig?.extra?.backendUrl || 'http://10.0.0.230:8001';
// export const BACKEND_URL = `${base}/detect/`;
// export const AUDIO_BACKEND_URL = `${base}/process-audio/`;


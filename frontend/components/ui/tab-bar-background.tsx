import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabBarBackground() {
  const colorScheme = useColorScheme();
  
  return (
    <BlurView
      tint={colorScheme === 'dark' ? 'dark' : 'light'}
      intensity={95}
      style={StyleSheet.absoluteFill}
    />
  );
}


import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Secrets (the login token) go to the phone's secure keychain; on web we fall back to AsyncStorage. */
export const secure = {
  async get(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

export const KEYS = {
  token: 'trucksy.token',
  apiUrl: 'trucksy.apiUrl',
  queue: 'trucksy.pingQueue',
  tracking: 'trucksy.trackingOn',
};

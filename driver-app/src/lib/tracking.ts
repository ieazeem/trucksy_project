/**
 * GPS tracking.
 *  • On a real phone: a background task with an Android foreground-service notification, so tracking
 *    keeps running with the screen off (the #1 thing the old app was missing).
 *  • If background permission is refused (or on web): falls back to foreground tracking.
 *  • Points that fail to send (no signal) are queued and sent later in one batch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { api } from './api';
import { KEYS } from './storage';

export const TRACKING_TASK = 'trucksy-background-location';
const MAX_QUEUE = 2000;

type Point = { lat: number; lng: number; speed_kmh: number | null; heading: number | null; accuracy_m: number | null; recorded_at: string };

function toPoint(loc: Location.LocationObject): Point {
  const { latitude, longitude, speed, heading, accuracy } = loc.coords;
  return {
    lat: latitude,
    lng: longitude,
    speed_kmh: speed != null && speed >= 0 ? Math.round(speed * 3.6 * 10) / 10 : null,
    heading: heading != null && heading >= 0 ? heading : null,
    accuracy_m: accuracy ?? null,
    recorded_at: new Date(loc.timestamp).toISOString(),
  };
}

async function readQueue(): Promise<Point[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEYS.queue)) || '[]'); } catch { return []; }
}

export async function sendPoints(points: Point[]) {
  if (!points.length) return;
  const queued = await readQueue();
  const all = [...queued, ...points].slice(-MAX_QUEUE);
  try {
    for (let i = 0; i < all.length; i += 500) {
      await api('me/location/', { body: { points: all.slice(i, i + 500) } });
    }
    if (queued.length) await AsyncStorage.removeItem(KEYS.queue);
  } catch (e: any) {
    // 401 = logged out: drop points. Otherwise keep them for later.
    if (e?.status === 401) { await AsyncStorage.removeItem(KEYS.queue); return; }
    await AsyncStorage.setItem(KEYS.queue, JSON.stringify(all));
  }
}

export async function queuedCount() {
  return (await readQueue()).length;
}

// Must be defined at module scope so Android can wake it up in the background.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
    if (error) return;
    const { locations } = (data || {}) as { locations?: Location.LocationObject[] };
    if (locations?.length) await sendPoints(locations.map(toPoint));
  });
}

let foregroundSub: Location.LocationSubscription | null = null;

export type TrackingMode = 'background' | 'foreground' | 'off';

export async function startTracking(): Promise<{ mode: TrackingMode; message?: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { mode: 'off', message: 'Trucksy needs location access to track your trips. Allow it in your phone settings.' };
  }
  await AsyncStorage.setItem(KEYS.tracking, '1');

  if (Platform.OS !== 'web') {
    const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
    if (bg.status === 'granted') {
      const running = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false);
      if (!running) {
        await Location.startLocationUpdatesAsync(TRACKING_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000,       // at most every 15 s
          distanceInterval: 50,      // or every 50 m
          deferredUpdatesInterval: 30000,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Trucksy is tracking your trip',
            notificationBody: 'Your dispatcher can see your truck on the map.',
            notificationColor: '#12459b',
          },
        });
      }
      return { mode: 'background' };
    }
  }

  // Foreground fallback (screen must stay on Trucksy).
  if (!foregroundSub) {
    foregroundSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 50 },
      (loc) => { sendPoints([toPoint(loc)]); },
    );
  }
  return {
    mode: 'foreground',
    message: Platform.OS === 'web' ? undefined
      : 'Tracking works while Trucksy is open. For screen-off tracking, set location to "Allow all the time".',
  };
}

export async function stopTracking() {
  await AsyncStorage.removeItem(KEYS.tracking);
  foregroundSub?.remove();
  foregroundSub = null;
  if (Platform.OS !== 'web') {
    const running = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
}

export async function wasTracking() {
  return (await AsyncStorage.getItem(KEYS.tracking)) === '1';
}

/** One-off position (attached to job status changes as proof of where it happened). */
export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const p = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch {
    return null;
  }
}

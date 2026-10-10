/**
 * Runs with no screen after the phone restarts (see plugins/withBootRestart.js).
 * If the driver was online and is still signed in, restart background tracking straight away,
 * so switching the phone off and on again does not quietly stop tracking.
 */
import * as Location from 'expo-location';
import { AppRegistry, Platform } from 'react-native';

import { KEYS, secure } from './storage';
import { startTracking, wasTracking } from './tracking';

async function restartAfterBoot() {
  try {
    if (!(await secure.get(KEYS.token)) || !(await wasTracking())) return;
    // Only restart silently when permission was already given; never prompt from the background.
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return;
    await startTracking();
  } catch {
    // Nothing to show here; tracking resumes when the driver next opens the app.
  }
}

if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('TrucksyBootRestart', () => restartAfterBoot);
}

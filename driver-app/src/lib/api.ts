import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { KEYS, secure } from './storage';

/**
 * Server address, in priority order:
 *  1. an address the driver/admin typed on the login screen (handy for testing on your Wi-Fi),
 *  2. EXPO_PUBLIC_API_URL baked in at build time (set per build profile in eas.json),
 *  3. `extra.apiUrl` in app.json.
 */
export const DEFAULT_API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://localhost:8000';

export async function getApiUrl() {
  const custom = await AsyncStorage.getItem(KEYS.apiUrl);
  return (custom || DEFAULT_API_URL).replace(/\/+$/, '');
}

export async function setApiUrl(url: string | null) {
  if (url && url.trim()) await AsyncStorage.setItem(KEYS.apiUrl, url.trim().replace(/\/+$/, ''));
  else await AsyncStorage.removeItem(KEYS.apiUrl);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const base = await getApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (opts.auth !== false) {
    const token = await secure.get(KEYS.token);
    if (token) headers.Authorization = `Token ${token}`;
  }
  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    res = await fetch(`${base}/api/${path}`, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    throw new ApiError('No connection to the Trucksy server. Check your mobile data and try again.', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.detail || Object.values(data).flat().join(' '))) || `Server error (${res.status}).`;
    throw new ApiError(String(msg), res.status);
  }
  return data as T;
}

// ---------- types matching the Django API ----------
export type Truck = { id: number; plate_number: string; kind: string; kind_label: string; make: string; model: string; capacity_kg: number };
export type Driver = {
  id: number; full_name: string; phone: string; cpr: string; license_number: string; license_expiry: string | null;
  truck: Truck | null; status: 'offline' | 'available' | 'on_job' | 'break'; status_label: string; last_seen: string | null;
};
export type Load = {
  id: number; reference: string; tracking_url: string;
  customer_name: string; customer_phone: string;
  pickup_address: string; pickup_lat: number | null; pickup_lng: number | null;
  dropoff_address: string; dropoff_lat: number | null; dropoff_lng: number | null;
  cargo_description: string; weight_kg: number; notes: string;
  status: string; status_label: string; next_driver_status: string | null;
  scheduled_pickup: string; picked_up_at: string | null; delivered_at: string | null; proof_receiver_name: string;
};
export type Me = {
  driver: Driver;
  active_load: Load | null;
  stats: { delivered_today: number; delivered_total: number; open_jobs: number };
};

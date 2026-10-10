import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Chip, RoadStrip, SignBoard, T } from '../../components/ui';
import { api, type Load, type Me } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { currentPosition, queuedCount, startTracking, stopTracking, wasTracking, type TrackingMode } from '../../lib/tracking';
import { colors, fonts, NEXT_ACTION } from '../../theme';

/** Job steps where the truck is on the road: tracking can't be turned off. */
const MOVING = ['to_pickup', 'loaded', 'in_transit'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function openMaps(lat: number | null, lng: number | null, address: string) {
  const q = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(address + ', Bahrain');
  const url = Platform.select({
    ios: `http://maps.apple.com/?daddr=${q}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
  });
  Linking.openURL(url!);
}

export default function Today() {
  const { setDriver, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<TrackingMode>('off');
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [queued, setQueued] = useState(0);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [receiver, setReceiver] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Me>('me/');
      setMe(data);
      setDriver(data.driver);
      setError('');
    } catch (e: any) {
      if (e.status === 401) return signOut();
      setError(e.message);
    }
    setQueued(await queuedCount());
  }, [setDriver, signOut]);

  // Refresh when the tab is shown and every 20 s while it is open.
  useFocusEffect(useCallback(() => {
    load();
    timer.current = setInterval(load, 20000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]));

  // Resume tracking automatically if the driver was online before the app restarted.
  useEffect(() => {
    wasTracking().then(async (on) => {
      if (on) setMode((await startTracking()).mode);
    });
  }, []);

  const online = mode !== 'off';

  async function toggleOnline(next: boolean) {
    // Tracking can't be switched off in the middle of a job: dispatch and the customer rely on it.
    const job = me?.active_load;
    if (!next && job && MOVING.includes(job.status)) {
      Alert.alert('Tracking stays on during a job',
        `You can go offline after ${job.reference} is delivered. If your location stops, dispatch is alerted straight away.`);
      return;
    }
    setToggling(true);
    try {
      if (next) {
        const res = await startTracking();
        setMode(res.mode);
        if (res.mode === 'off') { Alert.alert('Location needed', res.message || ''); return; }
        if (res.message) Alert.alert('Tracking is on', res.message);
        await api('me/status/', { body: { status: 'available' } });
        const pos = await currentPosition();
        if (pos) await api('me/location/', { body: pos }).catch(() => {});
      } else {
        await stopTracking();
        setMode('off');
        await api('me/status/', { body: { status: 'offline' } });
      }
      await load();
    } catch (e: any) {
      Alert.alert('Could not update', e.message);
    } finally {
      setToggling(false);
    }
  }

  async function advance(job: Load, receiverName?: string) {
    const next = job.next_driver_status;
    if (!next) return;
    if (next === 'delivered' && !receiverName) { setReceiver(''); setDeliverOpen(true); return; }
    setBusy(true);
    try {
      const pos = await currentPosition();
      await api(`me/loads/${job.id}/advance/`, {
        body: { status: next, lat: pos?.lat ?? null, lng: pos?.lng ?? null, receiver_name: receiverName || '' },
      });
      setDeliverOpen(false);
      if (!online && next === 'to_pickup') toggleOnline(true);
      await load();
      if (next === 'delivered') Alert.alert('Delivered', `${job.reference} is complete. Well done.`);
    } catch (e: any) {
      Alert.alert('Could not update the job', e.message);
    } finally {
      setBusy(false);
    }
  }

  const d = me?.driver;
  const job = me?.active_load;
  const action = job?.next_driver_status ? NEXT_ACTION[job.next_driver_status] : null;
  const goingToPickup = job && ['assigned', 'to_pickup'].includes(job.status);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={st.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <T variant="muted">{greeting()}{d ? `, ${d.full_name.split(' ')[0]}` : ''}</T>
        <View style={st.headRow}>
          <T style={st.h1}>{job ? 'Your job' : 'Today'}</T>
          {d?.truck ? <View style={st.plate}><T style={st.plateText}>{d.truck.plate_number}</T></View> : null}
        </View>

        {error ? <Card style={{ borderColor: colors.stop, marginBottom: 14 }}><T style={{ color: colors.stop }}>{error}</T></Card> : null}

        {/* Online switch — the single most important control */}
        <Pressable
          onPress={() => !toggling && toggleOnline(!online)}
          accessibilityRole="switch" accessibilityState={{ checked: online }}
          style={[st.onlineCard, online ? st.onlineOn : st.onlineOff]}
        >
          <View style={{ flex: 1 }}>
            <T style={[st.onlineTitle, { color: online ? '#fff' : colors.ink }]}>{online ? 'You are online' : 'You are offline'}</T>
            <T style={{ color: online ? colors.signText : colors.ink2, fontSize: 14 }}>
              {online
                ? mode === 'background' ? 'Your location is shared, even with the screen off.' : 'Your location is shared while Trucksy is open.'
                : 'Go online so dispatch can see you and send you jobs.'}
            </T>
            {queued > 0 ? <T style={{ color: colors.amber, fontSize: 13, marginTop: 4 }}>{queued} locations waiting for signal</T> : null}
          </View>
          <Switch
            value={online} disabled={toggling} onValueChange={toggleOnline}
            trackColor={{ true: colors.amber, false: colors.line }} thumbColor="#fff"
            {...(Platform.OS === 'web' ? ({ activeThumbColor: '#fff' } as object) : {})}
            accessibilityLabel="Online"
          />
        </Pressable>

        {job ? (
          <SignBoard style={{ marginTop: 16 }}>
            <View style={st.jobTop}>
              <T style={st.ref}>{job.reference}</T>
              <Chip status={job.status} label={job.status_label} />
            </View>
            <T style={st.customer}>{job.customer_name}</T>

            <View style={st.roadWrap}>
              <RoadStrip status={job.status} plate={d?.truck?.plate_number || 'You'} from={job.pickup_address} to={job.dropoff_address} />
            </View>

            <View style={st.stopRow}>
              <View style={[st.stopDot, { backgroundColor: goingToPickup ? colors.amber : '#fff' }]} />
              <View style={{ flex: 1 }}>
                <T style={st.stopLabel}>Pickup</T>
                <T style={st.stopAddr}>{job.pickup_address}</T>
              </View>
            </View>
            <View style={st.stopRow}>
              <View style={[st.stopDot, { backgroundColor: goingToPickup ? '#fff' : colors.amber }]} />
              <View style={{ flex: 1 }}>
                <T style={st.stopLabel}>Drop-off</T>
                <T style={st.stopAddr}>{job.dropoff_address}</T>
              </View>
            </View>

            <T style={st.cargo}>
              {[job.cargo_description, job.weight_kg ? `${job.weight_kg.toLocaleString()} kg` : ''].filter(Boolean).join(' — ')}
            </T>
            {job.notes ? <View style={st.notes}><T style={{ color: colors.ink }}>{job.notes}</T></View> : null}

            <View style={st.quick}>
              <Btn
                kind="onSign" style={{ flex: 1 }}
                title={goingToPickup ? 'Navigate to pickup' : 'Navigate to drop-off'}
                onPress={() => goingToPickup
                  ? openMaps(job.pickup_lat, job.pickup_lng, job.pickup_address)
                  : openMaps(job.dropoff_lat, job.dropoff_lng, job.dropoff_address)}
              />
              {job.customer_phone ? (
                <Btn kind="onSign" title="Call" onPress={() => Linking.openURL(`tel:${job.customer_phone.replace(/\s/g, '')}`)} />
              ) : null}
            </View>

            {action ? (
              <View style={{ marginTop: 16 }}>
                <Btn big title={action.label} loading={busy} onPress={() => advance(job)} />
                <T style={{ color: colors.signText, textAlign: 'center', fontSize: 13, marginTop: 6 }}>{action.hint}</T>
              </View>
            ) : null}
          </SignBoard>
        ) : (
          <Card style={{ marginTop: 16, alignItems: 'flex-start' }}>
            <T style={st.emptyTitle}>No job right now</T>
            <T variant="muted" style={{ marginTop: 4 }}>
              {online ? 'Stay online. New jobs from dispatch appear here automatically.' : 'Go online to receive your next job.'}
            </T>
          </Card>
        )}

        {me ? (
          <View style={st.stats}>
            <Card style={st.stat}><T style={st.statN}>{me.stats.delivered_today}</T><T variant="small">Delivered today</T></Card>
            <Card style={st.stat}><T style={st.statN}>{me.stats.open_jobs}</T><T variant="small">Open jobs</T></Card>
            <Card style={st.stat}><T style={st.statN}>{me.stats.delivered_total}</T><T variant="small">All-time</T></Card>
          </View>
        ) : null}
      </ScrollView>

      {/* Proof of delivery */}
      <Modal visible={deliverOpen} transparent animationType="slide" onRequestClose={() => setDeliverOpen(false)}>
        <View style={st.sheetBg}>
          <View style={st.sheet}>
            <T style={st.sheetTitle}>Who received the goods?</T>
            <T variant="muted">Their name is saved as proof of delivery.</T>
            <TextInput
              style={st.sheetInput} value={receiver} onChangeText={setReceiver} autoFocus
              placeholder="e.g. Ahmed, store keeper" placeholderTextColor={colors.ink3} returnKeyType="done"
              onSubmitEditing={() => receiver.trim() && job && advance(job, receiver.trim())}
            />
            <Btn big title="Confirm delivery" loading={busy} disabled={!receiver.trim()} onPress={() => job && advance(job, receiver.trim())} />
            <Btn kind="ghost" title="Not yet" onPress={() => setDeliverOpen(false)} style={{ marginTop: 6 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 32 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42 },
  plate: { borderWidth: 1, borderColor: colors.amber, borderRadius: 5, paddingHorizontal: 8, backgroundColor: '#000' },
  plateText: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.5, color: colors.amber },
  onlineCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, padding: 16, borderWidth: 1 },
  onlineOn: { backgroundColor: '#000', borderColor: colors.amber },
  onlineOff: { backgroundColor: colors.paper, borderColor: '#1a1a1a' },
  onlineTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  jobTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ref: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: '#fff' },
  customer: { color: colors.signText, marginBottom: 10 },
  roadWrap: { backgroundColor: colors.paper, borderRadius: 8, padding: 10, paddingTop: 6, marginBottom: 12 },
  stopRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10 },
  stopDot: { width: 12, height: 12, borderRadius: 6, marginTop: 6, borderWidth: 2, borderColor: '#fff' },
  stopLabel: { color: colors.signText, fontSize: 13 },
  stopAddr: { color: '#fff', fontFamily: fonts.semibold, fontSize: 18, lineHeight: 23 },
  cargo: { color: colors.signText, fontSize: 14, marginTop: 2 },
  notes: { backgroundColor: colors.amberTint, borderRadius: 6, padding: 10, marginTop: 10, borderLeftWidth: 3, borderLeftColor: colors.amber },
  quick: { flexDirection: 'row', gap: 10, marginTop: 14 },
  emptyTitle: { fontFamily: fonts.displaySemi, fontSize: 24, lineHeight: 28 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: { flex: 1, padding: 12 },
  statN: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 34, gap: 10 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32 },
  sheetInput: { borderWidth: 1, borderColor: '#1a1a1a', backgroundColor: colors.field, borderRadius: 8, padding: 14, fontSize: 18, fontFamily: fonts.medium, color: colors.ink, marginVertical: 6 },
});

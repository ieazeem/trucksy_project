import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, SignBoard, T } from '../../components/ui';
import { api, getApiUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, fonts } from '../../theme';

const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set');

export default function Profile() {
  const { driver, signOut } = useAuth();
  const [server, setServer] = useState('');
  useEffect(() => { getApiUrl().then(setServer); }, []);

  const confirmSignOut = async () => {
    const me = await api<{ active_load: { reference: string; status: string } | null }>('me/').catch(() => null);
    const job = me?.active_load;
    if (job && ['to_pickup', 'loaded', 'in_transit'].includes(job.status)) {
      Alert.alert('Finish your job first', `You can sign out after ${job.reference} is delivered. Tracking stays on during a job.`);
      return;
    }
    Alert.alert('Sign out?', 'Tracking stops and dispatch will see you as offline.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const licenceDays = driver?.license_expiry ? Math.round((+new Date(driver.license_expiry) - Date.now()) / 86400000) : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={st.wrap}>
        <T style={st.h1}>Profile</T>
        <SignBoard>
          <T style={st.name}>{driver?.full_name ?? '—'}</T>
          <T style={{ color: colors.signText }}>{driver?.phone}</T>
          {driver?.truck ? (
            <View style={st.truckRow}>
              <View style={st.plate}><T style={st.plateText}>{driver.truck.plate_number}</T></View>
              <T style={{ color: '#fff', flex: 1 }}>{driver.truck.kind_label} · {[driver.truck.make, driver.truck.model].filter(Boolean).join(' ')}</T>
            </View>
          ) : <T style={{ color: colors.signText, marginTop: 10 }}>No truck assigned yet.</T>}
        </SignBoard>

        <Card style={{ marginTop: 14 }}>
          <Row label="CPR" value={driver?.cpr || '—'} />
          <Row label="Licence" value={driver?.license_number || '—'} />
          <Row
            label="Licence expiry"
            value={date(driver?.license_expiry ?? null)}
            warn={licenceDays != null && licenceDays <= 30}
          />
        </Card>
        {licenceDays != null && licenceDays <= 30 ? (
          <T style={{ color: colors.stop, marginTop: 8 }}>
            {licenceDays < 0 ? 'Your licence has expired. Renew it before driving.' : `Your licence expires in ${licenceDays} days. Plan the renewal now.`}
          </T>
        ) : null}

        <Btn kind="danger" title="Sign out" onPress={confirmSignOut} style={{ marginTop: 22 }} />
        <T variant="small" style={{ textAlign: 'center', marginTop: 16 }}>
          Trucksy Driver {Constants.expoConfig?.version} · {server.replace(/^https?:\/\//, '')}
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={st.row}>
      <T variant="muted">{label}</T>
      <T style={[{ fontFamily: fonts.semibold }, warn && { color: colors.stop }]}>{value}</T>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 32 },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, marginBottom: 14 },
  name: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: '#fff' },
  truckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  plate: { borderWidth: 1, borderColor: colors.amber, borderRadius: 5, paddingHorizontal: 8, backgroundColor: '#000' },
  plateText: { fontFamily: fonts.display, fontSize: 18, color: colors.amber },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
});

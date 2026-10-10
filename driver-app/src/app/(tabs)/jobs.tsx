import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Chip, T } from '../../components/ui';
import { api, type Load } from '../../lib/api';
import { colors, fonts } from '../../theme';

const when = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export default function Jobs() {
  const [data, setData] = useState<{ active: Load[]; history: Load[] } | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api('me/loads/')); setError(''); } catch (e: any) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = data ? [
    { title: 'Coming up', data: data.active, empty: 'Nothing assigned yet.' },
    { title: 'Completed', data: data.history, empty: 'Your finished jobs will show here.' },
  ] : [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <SectionList
        contentContainerStyle={st.wrap}
        sections={sections}
        keyExtractor={(l) => String(l.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View>
            <T style={st.h1}>My jobs</T>
            {error ? <T style={{ color: colors.stop, marginBottom: 10 }}>{error}</T> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View>
            <T style={st.section}>{section.title}</T>
            {section.data.length === 0 ? <T variant="muted" style={{ marginBottom: 8 }}>{section.empty}</T> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <Card style={st.item}>
            <View style={st.row}>
              <T style={st.ref}>{item.reference}</T>
              <Chip status={item.status} label={item.status_label} />
            </View>
            <T variant="muted">{item.customer_name}</T>
            <T style={{ marginTop: 6 }}>{item.pickup_address}</T>
            <T variant="muted">to {item.dropoff_address}</T>
            <T variant="small" style={{ marginTop: 6 }}>
              {item.status === 'delivered'
                ? `Delivered ${when(item.delivered_at)}${item.proof_receiver_name ? ` to ${item.proof_receiver_name}` : ''}`
                : `Pickup ${when(item.scheduled_pickup)}`}
            </T>
          </Card>
        )}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 32 },
  h1: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, marginBottom: 6 },
  section: { fontFamily: fonts.displaySemi, fontSize: 22, lineHeight: 26, marginTop: 14, marginBottom: 8 },
  item: { marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  ref: { fontFamily: fonts.bold, fontSize: 17 },
});

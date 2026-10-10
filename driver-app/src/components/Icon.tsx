import { StyleSheet, View } from 'react-native';

/**
 * Tiny dependency-free icon set drawn with Views (keeps the app light — no icon font to load).
 */
type Props = { name: 'truck' | 'list' | 'person'; color: string; size?: number };

export function Icon({ name, color, size = 24 }: Props) {
  const u = size / 24;
  if (name === 'truck') {
    return (
      <View style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', left: 2 * u, top: 6 * u, width: 11 * u, height: 10 * u, borderWidth: 2 * u, borderColor: color, borderRadius: 2 * u }} />
        <View style={{ position: 'absolute', left: 12 * u, top: 9 * u, width: 9 * u, height: 7 * u, borderWidth: 2 * u, borderColor: color, borderTopRightRadius: 4 * u, borderRadius: 1 * u }} />
        <View style={[st.wheel, { left: 4.5 * u, top: 15.5 * u, width: 4 * u, height: 4 * u, borderRadius: 2 * u, borderWidth: 2 * u, borderColor: color }]} />
        <View style={[st.wheel, { left: 15 * u, top: 15.5 * u, width: 4 * u, height: 4 * u, borderRadius: 2 * u, borderWidth: 2 * u, borderColor: color }]} />
      </View>
    );
  }
  if (name === 'list') {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center', gap: 4 * u, paddingHorizontal: 3 * u }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 * u }}>
            <View style={{ width: 3 * u, height: 3 * u, borderRadius: 2 * u, backgroundColor: color }} />
            <View style={{ flex: 1, height: 2 * u, backgroundColor: color, borderRadius: u }} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={{ marginTop: 3 * u, width: 8 * u, height: 8 * u, borderRadius: 4 * u, borderWidth: 2 * u, borderColor: color }} />
      <View style={{ marginTop: 2 * u, width: 16 * u, height: 7 * u, borderTopLeftRadius: 8 * u, borderTopRightRadius: 8 * u, borderWidth: 2 * u, borderBottomWidth: 0, borderColor: color }} />
    </View>
  );
}

const st = StyleSheet.create({ wheel: { position: 'absolute', backgroundColor: '#fff' } });

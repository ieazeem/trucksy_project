import { Image, StyleSheet } from 'react-native';

// Same badge as the Level Up gym app: lettering is part of the PNG (1x, 2x, 3x).
const ON_DARK = require('../../assets/branding/powered-by-level-up-dark.png');

const HEIGHT = 22;
// The 1x file is 169 x 24.
const WIDTH = Math.round((169 / 24) * HEIGHT);

/** "Powered by Level Up", centred. Shown on the sign-in and profile screens. */
export function PoweredBy() {
  return <Image source={ON_DARK} style={st.badge} resizeMode="contain" accessibilityLabel="Powered by Level Up" />;
}

const st = StyleSheet.create({
  badge: { width: WIDTH, height: HEIGHT, alignSelf: 'center', marginTop: 16 },
});

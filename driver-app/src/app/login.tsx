import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, SignBoard, T } from '../components/ui';
import { Wordmark } from '../components/Wordmark';
import { PoweredBy } from '../components/PoweredBy';
import { DEFAULT_API_URL, getApiUrl, setApiUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, fonts } from '../theme';

export default function Login() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState('');

  useEffect(() => { getApiUrl().then(setServer); }, []);

  async function submit() {
    setError('');
    if (!phone.trim() || !pin.trim()) {
      setError('Enter your mobile number and PIN.');
      return;
    }
    setBusy(true);
    try {
      if (showServer) await setApiUrl(server === DEFAULT_API_URL ? null : server);
      await signIn(phone, pin);
    } catch (e: any) {
      setError(e.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.concrete }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <View style={st.brand}>
            <Wordmark size={34} />
          </View>

          <SignBoard>
            <T style={st.h1}>Driver sign in</T>
            <T style={st.lead}>Use the mobile number your dispatcher registered.</T>

            <T style={st.label} nativeID="phoneLabel">Mobile number</T>
            <TextInput
              accessibilityLabelledBy="phoneLabel"
              style={st.input} value={phone} onChangeText={setPhone}
              placeholder="3xxx xxxx" placeholderTextColor={colors.ink3}
              keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" returnKeyType="next"
            />
            <T style={st.label} nativeID="pinLabel">PIN</T>
            <TextInput
              accessibilityLabelledBy="pinLabel"
              style={st.input} value={pin} onChangeText={setPin}
              placeholder="••••" placeholderTextColor={colors.ink3}
              keyboardType="number-pad" secureTextEntry maxLength={12} onSubmitEditing={submit} returnKeyType="go"
            />
            {error ? <T style={st.error} accessibilityLiveRegion="polite">{error}</T> : null}
            <Btn title="Sign in" onPress={submit} loading={busy} big style={{ marginTop: 18 }} />
          </SignBoard>

          <Pressable onPress={() => setShowServer((v) => !v)} accessibilityRole="button" style={st.serverToggle}>
            <T variant="small">{showServer ? 'Hide server settings' : 'Server settings'}</T>
          </Pressable>
          {showServer && (
            <View style={st.serverBox}>
              <T variant="small">Only change this if your dispatcher asks you to.</T>
              <TextInput
                style={[st.input, { borderColor: colors.line, borderWidth: 1, marginTop: 6 }]} value={server} onChangeText={setServer}
                autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-server.com"
              />
            </View>
          )}
          <T variant="small" style={{ textAlign: 'center', marginTop: 12 }}>Forgot your PIN? Ask your dispatcher to reset it.</T>
          <PoweredBy />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 20, paddingTop: 36, flexGrow: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  h1: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40, color: '#fff' },
  lead: { color: colors.signText, marginTop: 2, marginBottom: 14 },
  label: { color: '#fff', fontFamily: fonts.semibold, fontSize: 14, marginTop: 10, marginBottom: 5 },
  input: { backgroundColor: colors.field, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontFamily: fonts.medium, color: colors.ink },
  error: { color: colors.stop, marginTop: 12, fontFamily: fonts.medium },
  serverToggle: { alignSelf: 'center', padding: 12, marginTop: 10 },
  serverBox: { backgroundColor: colors.paper, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#1a1a1a' },
});

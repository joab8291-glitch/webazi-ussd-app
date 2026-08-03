import { useState, useEffect } from 'react';
import { View, Text, Button, ScrollView, StyleSheet, PermissionsAndroid, Platform, TextInput } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import SmsListener from '../../modules/sms-listener/src/SmsListenerModule';
import type { SmsReceivedPayload, SimSlotInfo } from '../../modules/sms-listener/src/SmsListener.types';
import UssdExecutor from '../../modules/ussd-executor/src/UssdExecutorModule';
import { processIncomingSms } from '../../modules/offer-matcher/matcher';
import { DataPlan } from '../../modules/offer-matcher/types';

const requestSmsPermissions = async () => {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
  ]);

  return Object.values(granted).every(
    (status) => status === PermissionsAndroid.RESULTS.GRANTED
  );
};

const requestCallPermission = async () => {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CALL_PHONE,
    {
      title: 'Phone Call Permission',
      message: 'This app needs permission to dial USSD codes.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

export default function TestScreen() {
  const [simSlots, setSimSlots] = useState<SimSlotInfo[] | null>(null);
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState<SmsReceivedPayload[]>([]);
  const [error, setError] = useState<string | null>(null)
const [helloResult, setHelloResult] = useState<string | null>(null);

const [ussdCode, setUssdCode] = useState('*334#');
const [ussdResult, setUssdResult] = useState<string | null>(null);
const [ussdLoading, setUssdLoading] = useState(false);

const [matchLog, setMatchLog] = useState<string[]>([]);

  useEffect(() => {
  const subscription: EventSubscription = SmsListener.addListener(
  'onSmsReceived',
  (event: SmsReceivedPayload) => {
    setMessages((prev) => [event, ...prev]);
    const match = processIncomingSms(event.body);

    if (match.status === 'matched') {
      setMatchLog((prev) => [
        `✅ ${match.plan.name} for ${match.payment.phone} — dialing ${match.resolvedUssd}`,
        ...prev,
      ]);
      autoDial(match.plan, match.resolvedUssd);
    } else if (match.status === 'missing_phone') {
      setMatchLog((prev) => [
        `⚠️ Matched "${match.plan.name}" but couldn't extract phone number from SMS`,
        ...prev,
      ]);
    } else if (match.status === 'no_match') {
      setMatchLog((prev) => [
        `⚠️ Payment of KES ${match.payment.amount} — no matching plan`,
        ...prev,
      ]);
    }
  }
);
     
  return () => subscription.remove();
}, []);

const autoDial = async (plan: DataPlan, resolvedUssd: string) => {
  try {
    const ok = await requestCallPermission();
    if (!ok) {
      setMatchLog((prev) => [`❌ CALL_PHONE denied — cannot auto-dial ${plan.name}`, ...prev]);
      return;
    }
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Auto-dial timed out after 15s')), 15000)
    );
    const result = await Promise.race([
      UssdExecutor.startUssd(resolvedUssd, plan.followUpInputs, plan.simSlot),
      timeout,
    ]);
    setMatchLog((prev) => [`📞 ${plan.name} result: ${result}`, ...prev]);
  } catch (e: any) {
    setMatchLog((prev) => [`❌ Auto-dial failed for ${plan.name}: ${String(e?.message ?? e)}`, ...prev]);
  }
};

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Webazi USSD App — Native Module Test</Text>

      <View style={styles.section}>
        <Text style={styles.subtitle}>SMS Listener</Text>
        <Button title="Get SIM Slots" onPress={handleGetSimSlots} />
        <Text style={styles.mono}>
          {simSlots ? JSON.stringify(simSlots, null, 2) : 'Not fetched yet'}
        </Text>
        <Button
          title={listening ? 'Stop Listening' : 'Start Listening'}
          onPress={listening ? handleStopListening : handleStartListening}
        />
        <Text>{listening ? '✅ SMS listener active' : '⏸ Not listening'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.subtitle}>USSD Executor (stub)</Text>
        <Button title="Call hello()" onPress={handleTestUssdModule} />
        <Text style={styles.mono}>{helloResult ?? 'Not called yet'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.subtitle}>USSD Executor — Live Dial</Text>
        <TextInput
          value={ussdCode}
          onChangeText={setUssdCode}
          placeholder="*334#"
          style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6 }}
        />
        <Button
          title={ussdLoading ? 'Dialing...' : 'Start USSD'}
          onPress={handleStartUssd}
          disabled={ussdLoading}
        />
        <Text style={styles.mono}>{ussdResult ?? 'No result yet'}</Text>
      </View>

      {error && <Text style={styles.error}>Error: {error}</Text>}

      <View style={styles.section}>
        <Text style={styles.subtitle}>Received SMS ({messages.length})</Text>
        {messages.map((m, i) => (
          <Text key={i} style={styles.mono}>{JSON.stringify(m)}</Text>
        ))}
      </View>
<View style={styles.section}>
        <Text style={styles.subtitle}>Received SMS ({messages.length})</Text>
        {messages.map((m, i) => (
          <Text key={i} style={styles.mono}>{JSON.stringify(m)}</Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.subtitle}>Offer Matcher Log</Text>
        {matchLog.length === 0 && <Text style={styles.mono}>No matches yet</Text>}
        {matchLog.map((line, i) => (
          <Text key={i} style={styles.mono}>{line}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  subtitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  section: { gap: 8, marginBottom: 16 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#333' },
  error: { color: 'red', marginBottom: 12 },
});

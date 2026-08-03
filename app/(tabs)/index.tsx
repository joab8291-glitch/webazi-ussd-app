import { useState, useEffect } from 'react';
import { View, Text, Button, ScrollView, StyleSheet, PermissionsAndroid, Platform, TextInput } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import SmsListener from '../../modules/sms-listener/src/SmsListenerModule';
import type { SmsReceivedPayload, SimSlotInfo } from '../../modules/sms-listener/src/SmsListener.types';
import UssdExecutor from '../../modules/ussd-executor/src/UssdExecutorModule';

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
  const [error, setError] = useState<string | null>(null);
  const [helloResult, setHelloResult] = useState<string | null>(null);

  const [ussdCode, setUssdCode] = useState('*334#');
  const [ussdResult, setUssdResult] = useState<string | null>(null);
  const [ussdLoading, setUssdLoading] = useState(false);

  useEffect(() => {
    const subscription: EventSubscription = SmsListener.addListener(
      'onSmsReceived',
      (event: SmsReceivedPayload) => {
        setMessages((prev) => [event, ...prev]);
      }
    );
    return () => subscription.remove();
  }, []);

  const handleGetSimSlots = async () => {
    try {
      const ok = await requestSmsPermissions();
      if (!ok) {
        setError('Permissions denied');
        return;
      }
      const result = SmsListener.getSimSlots();
      setSimSlots(result);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleStartListening = async () => {
    try {
      const ok = await requestSmsPermissions();
      if (!ok) {
        setError('Permissions denied');
        return;
      }
      SmsListener.startListening();
      setListening(true);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleStopListening = () => {
    try {
      SmsListener.stopListening();
      setListening(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleTestUssdModule = () => {
    try {
      setHelloResult(UssdExecutor.hello());
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleStartUssd = async () => {
    setUssdLoading(true);
    setUssdResult(null);
    try {
      const ok = await requestCallPermission();
      if (!ok) {
        setError('CALL_PHONE permission denied');
        setUssdLoading(false);
        return;
      }

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Timed out after 15s — Accessibility Service may not be reading the dialog')),
          15000
        )
      );

      const result = await Promise.race([
        UssdExecutor.startUssd(ussdCode, [], -1),
        timeout,
      ]);

      setUssdResult(result);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setUssdLoading(false);
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
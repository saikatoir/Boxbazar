import { getPlatformConfig } from './platform-config.js';

async function sendViaBulkSMS(phone: string, message: string): Promise<void> {
  const { bulkSmsApiKey, bulkSmsSenderId } = await getPlatformConfig();
  if (!bulkSmsApiKey) throw new Error('BULKSMS_API_KEY not configured');
  const url = new URL('https://bulksmsbd.net/api/smsapi');
  url.searchParams.set('api_key', bulkSmsApiKey);
  url.searchParams.set('type', 'text');
  url.searchParams.set('number', phone);
  url.searchParams.set('senderid', bulkSmsSenderId);
  url.searchParams.set('message', message);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`BulkSMSBD HTTP ${res.status}`);
  const body = (await res.json()) as { response_code?: number };
  if (body.response_code !== 202) {
    throw new Error(`BulkSMSBD error: ${JSON.stringify(body)}`);
  }
}

async function sendViaSSLWireless(phone: string, message: string): Promise<void> {
  const { sslSmsSid, sslSmsToken } = await getPlatformConfig();
  if (!sslSmsSid || !sslSmsToken) {
    throw new Error('SSL Wireless credentials not configured');
  }
  const res = await fetch('https://msg.sslwireless.com/pushapi/dynamic/server.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_token: sslSmsToken,
      sid: sslSmsSid,
      msisdn: [phone],
      sms: message,
      csmsid: `otp_${Date.now()}`,
    }),
  });
  if (!res.ok) throw new Error(`SSL Wireless HTTP ${res.status}`);
}

export async function sendSMS(phone: string, message: string): Promise<void> {
  try {
    await sendViaBulkSMS(phone, message);
  } catch (primaryErr) {
    console.warn('BulkSMSBD failed, trying SSL Wireless:', primaryErr);
    await sendViaSSLWireless(phone, message);
  }
}

export async function sendOtpSMS(phone: string, otp: string): Promise<void> {
  const message = `আপনার BoxBazar OTP কোড: ${otp}। ৫ মিনিটের মধ্যে ব্যবহার করুন। কাউকে শেয়ার করবেন না।`;
  await sendSMS(phone, message);
}

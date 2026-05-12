import { env } from '../env.js';

async function sendViaBulkSMS(phone: string, message: string): Promise<void> {
  if (!env.BULKSMS_API_KEY) throw new Error('BULKSMS_API_KEY not configured');
  const url = new URL('https://bulksmsbd.net/api/smsapi');
  url.searchParams.set('api_key', env.BULKSMS_API_KEY);
  url.searchParams.set('type', 'text');
  url.searchParams.set('number', phone);
  url.searchParams.set('senderid', env.BULKSMS_SENDER_ID);
  url.searchParams.set('message', message);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`BulkSMSBD HTTP ${res.status}`);
  const body = (await res.json()) as { response_code?: number };
  if (body.response_code !== 202) {
    throw new Error(`BulkSMSBD error: ${JSON.stringify(body)}`);
  }
}

async function sendViaSSLWireless(phone: string, message: string): Promise<void> {
  if (!env.SSL_SMS_SID || !env.SSL_SMS_TOKEN) {
    throw new Error('SSL Wireless credentials not configured');
  }
  const res = await fetch('https://msg.sslwireless.com/pushapi/dynamic/server.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_token: env.SSL_SMS_TOKEN,
      sid: env.SSL_SMS_SID,
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
  const message = `আপনার fCommerce Ops OTP কোড: ${otp}। ৫ মিনিটের মধ্যে ব্যবহার করুন। কাউকে শেয়ার করবেন না।`;
  await sendSMS(phone, message);
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Facebook,
  Sparkles,
  MessageSquareText,
  Truck,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Label, Select, FieldHint } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

/* --------------------------------------------------------- types */

interface PlatformConfig {
  metaAppId: string | null;
  metaGraphVersion: string;
  publicWebhookUrl: string | null;
  geminiModel: string;
  aiProvider: 'gemini' | 'mock' | null;
  bulkSmsSenderId: string;
  hasSecret: {
    metaAppSecret: boolean;
    metaVerifyToken: boolean;
    geminiApiKey: boolean;
    bulkSmsApiKey: boolean;
    sslSmsSid: boolean;
    sslSmsToken: boolean;
    steadfastWebhookToken: boolean;
    pathaoWebhookToken: boolean;
    redxWebhookToken: boolean;
  };
  ready: { messengerWebhook: boolean; aiEngine: boolean };
  updatedAt: string | null;
}

type SecretKey = keyof PlatformConfig['hasSecret'];

/* --------------------------------------------------------- secret input */

function SecretInput({
  saved,
  value,
  onChange,
  placeholder,
}: {
  saved: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={saved ? '••••••••••• (leave blank to keep)' : placeholder}
        className="pr-9"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 rounded"
        aria-label={show ? 'Hide' : 'Show'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* --------------------------------------------------------- copy-paste row */

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 font-mono text-xs text-neutral-700 truncate">
        {value}
      </div>
      <Button variant="outline" size="sm" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

/* --------------------------------------------------------- page */

export default function PlatformSetupPage() {
  const { token } = useAuthStore();
  const toast = useToast();
  const authHeader = { Authorization: `Bearer ${token}` };

  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state (public + secret patches).
  const [metaAppId, setMetaAppId] = useState('');
  const [metaGraphVersion, setMetaGraphVersion] = useState('v21.0');
  const [publicWebhookUrl, setPublicWebhookUrl] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'mock'>('gemini');
  const [bulkSmsSenderId, setBulkSmsSenderId] = useState('BoxBazar');
  const [secrets, setSecrets] = useState<Record<SecretKey, string>>({
    metaAppSecret: '',
    metaVerifyToken: '',
    geminiApiKey: '',
    bulkSmsApiKey: '',
    sslSmsSid: '',
    sslSmsToken: '',
    steadfastWebhookToken: '',
    pathaoWebhookToken: '',
    redxWebhookToken: '',
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/platform/config', { headers: authHeader });
    const body = (await res.json()) as { config: PlatformConfig };
    setConfig(body.config);
    setMetaAppId(body.config.metaAppId ?? '');
    setMetaGraphVersion(body.config.metaGraphVersion || 'v21.0');
    setPublicWebhookUrl(body.config.publicWebhookUrl ?? '');
    setGeminiModel(body.config.geminiModel || 'gemini-2.5-flash');
    setAiProvider(body.config.aiProvider === 'mock' ? 'mock' : 'gemini');
    setBulkSmsSenderId(body.config.bulkSmsSenderId || 'BoxBazar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [load, token]);

  function setSecret(k: SecretKey, v: string) {
    setSecrets((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    setSaving(true);
    // Only send non-empty secret patches; "" sent explicitly clears them.
    const secretsToSend: Partial<Record<SecretKey, string>> = {};
    for (const [k, v] of Object.entries(secrets) as [SecretKey, string][]) {
      if (v.length > 0) secretsToSend[k] = v;
    }
    const payload = {
      metaAppId: metaAppId.trim() || null,
      metaGraphVersion: metaGraphVersion.trim() || null,
      publicWebhookUrl: publicWebhookUrl.trim() || null,
      geminiModel: geminiModel.trim() || null,
      aiProvider,
      bulkSmsSenderId: bulkSmsSenderId.trim() || null,
      secrets: secretsToSend,
    };
    try {
      const res = await fetch('/api/platform/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { config?: PlatformConfig; message?: string };
      if (!res.ok || !body.config) throw new Error(body.message ?? 'Save failed');
      setConfig(body.config);
      setSecrets({
        metaAppSecret: '',
        metaVerifyToken: '',
        geminiApiKey: '',
        bulkSmsApiKey: '',
        sslSmsSid: '',
        sslSmsToken: '',
        steadfastWebhookToken: '',
        pathaoWebhookToken: '',
        redxWebhookToken: '',
      });
      toast('Platform API keys saved.');
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <PageContainer>
        <PageHeader title="Platform API keys" description="Loading…" />
      </PageContainer>
    );
  }

  const webhookUrl = publicWebhookUrl.trim() || config.publicWebhookUrl || '';
  const computedWebhookCallback = webhookUrl
    ? webhookUrl.replace(/\/$/, '') + '/api/webhooks/messenger'
    : '';

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Platform API keys"
        description="Set these once to launch the project — they are the platform-wide credentials BoxBazar uses to talk to Facebook, Gemini, SMS and the courier services."
        action={
          <div className="flex flex-col items-end gap-1">
            <Badge tone={config.ready.messengerWebhook ? 'success' : 'warning'} dot>
              {config.ready.messengerWebhook ? 'Webhook ready' : 'Webhook not ready'}
            </Badge>
            <Badge tone={config.ready.aiEngine ? 'success' : 'neutral'} dot>
              {config.ready.aiEngine ? 'Gemini ready' : 'Using offline mock'}
            </Badge>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Meta */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Facebook className="w-4 h-4 text-[#1877F2]" />
                Meta (Facebook) App
              </span>
            }
            description="Required to verify webhook signatures and call the Graph API. Get these from developers.facebook.com → your App → Settings → Basic."
            action={
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1"
              >
                Meta dashboard <ExternalLink className="w-3 h-3" />
              </a>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label required>Meta App ID</Label>
                <Input
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  placeholder="e.g. 1234567890123456"
                />
                <FieldHint>The numeric ID of your Meta App. Not a secret.</FieldHint>
              </div>
              <div>
                <Label>Graph API version</Label>
                <Input
                  value={metaGraphVersion}
                  onChange={(e) => setMetaGraphVersion(e.target.value)}
                  placeholder="v21.0"
                />
                <FieldHint>Bump only if Meta deprecates v21.</FieldHint>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label required>
                  App Secret
                  {config.hasSecret.metaAppSecret && (
                    <Badge tone="success" className="ml-2">saved</Badge>
                  )}
                </Label>
                <SecretInput
                  saved={config.hasSecret.metaAppSecret}
                  value={secrets.metaAppSecret}
                  onChange={(v) => setSecret('metaAppSecret', v)}
                  placeholder="Settings → Basic → App Secret (click Show)"
                />
                <FieldHint>Used to verify the X-Hub-Signature-256 header on every webhook event.</FieldHint>
              </div>
              <div>
                <Label required>
                  Verify Token
                  {config.hasSecret.metaVerifyToken && (
                    <Badge tone="success" className="ml-2">saved</Badge>
                  )}
                </Label>
                <SecretInput
                  saved={config.hasSecret.metaVerifyToken}
                  value={secrets.metaVerifyToken}
                  onChange={(v) => setSecret('metaVerifyToken', v)}
                  placeholder="Any string — must match the value in the Meta App console"
                />
                <FieldHint>Paste the same value into the Meta Webhooks → Callback URL → Verify Token field.</FieldHint>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Public webhook URL */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-neutral-500" />
                Public webhook URL
              </span>
            }
            description="Where Meta and the couriers reach this server from the internet (ngrok / Cloudflare Tunnel / your domain)."
          />
          <CardBody className="space-y-4">
            <div>
              <Label>Base URL</Label>
              <Input
                value={publicWebhookUrl}
                onChange={(e) => setPublicWebhookUrl(e.target.value)}
                placeholder="https://api.yourdomain.com"
              />
              <FieldHint>No trailing slash. We compute the full callback paths below.</FieldHint>
            </div>
            {computedWebhookCallback && (
              <div className="space-y-2 pt-2 border-t border-neutral-100">
                <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                  Copy these into your Meta App console
                </p>
                <div>
                  <Label>Callback URL</Label>
                  <CopyField value={computedWebhookCallback} label="callback URL" />
                </div>
                <div>
                  <Label>Subscribe to fields</Label>
                  <CopyField value="messages, messaging_postbacks" label="fields" />
                </div>
                <p className="text-[11px] text-neutral-500">
                  In Meta → your App → Messenger → Settings → Webhooks: paste the callback URL,
                  paste the verify token from above, then subscribe the page to the two fields.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Gemini */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Google Gemini (AI engine)
              </span>
            }
            description="Powers the AI receptionist. Without a key, the offline mock provider is used and replies become heuristic-only."
            action={
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1"
              >
                Get an API key <ExternalLink className="w-3 h-3" />
              </a>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Provider</Label>
                <Select value={aiProvider} onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'mock')}>
                  <option value="gemini">Gemini (production)</option>
                  <option value="mock">Mock (offline / dev)</option>
                </Select>
                <FieldHint>Switch to Mock to test the pipeline without burning Gemini quota.</FieldHint>
              </div>
              <div>
                <Label>Model</Label>
                <Input
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  placeholder="gemini-2.5-flash"
                />
                <FieldHint>e.g. gemini-2.5-flash or gemini-2.5-pro.</FieldHint>
              </div>
            </div>
            <div>
              <Label>
                Gemini API key
                {config.hasSecret.geminiApiKey && (
                  <Badge tone="success" className="ml-2">saved</Badge>
                )}
              </Label>
              <SecretInput
                saved={config.hasSecret.geminiApiKey}
                value={secrets.geminiApiKey}
                onChange={(v) => setSecret('geminiApiKey', v)}
                placeholder="AIza…"
              />
            </div>
          </CardBody>
        </Card>

        {/* SMS */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-emerald-500" />
                SMS providers
              </span>
            }
            description="OTPs and order alerts. BulkSMSBD is the primary; SSL Wireless is the fallback."
          />
          <CardBody className="space-y-5">
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                BulkSMSBD (primary)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>
                    API key
                    {config.hasSecret.bulkSmsApiKey && (
                      <Badge tone="success" className="ml-2">saved</Badge>
                    )}
                  </Label>
                  <SecretInput
                    saved={config.hasSecret.bulkSmsApiKey}
                    value={secrets.bulkSmsApiKey}
                    onChange={(v) => setSecret('bulkSmsApiKey', v)}
                  />
                </div>
                <div>
                  <Label>Sender ID</Label>
                  <Input
                    value={bulkSmsSenderId}
                    onChange={(e) => setBulkSmsSenderId(e.target.value)}
                    placeholder="BoxBazar"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-3 pt-3 border-t border-neutral-100">
              <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                SSL Wireless (fallback)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>
                    SID
                    {config.hasSecret.sslSmsSid && (
                      <Badge tone="success" className="ml-2">saved</Badge>
                    )}
                  </Label>
                  <SecretInput
                    saved={config.hasSecret.sslSmsSid}
                    value={secrets.sslSmsSid}
                    onChange={(v) => setSecret('sslSmsSid', v)}
                  />
                </div>
                <div>
                  <Label>
                    Token
                    {config.hasSecret.sslSmsToken && (
                      <Badge tone="success" className="ml-2">saved</Badge>
                    )}
                  </Label>
                  <SecretInput
                    saved={config.hasSecret.sslSmsToken}
                    value={secrets.sslSmsToken}
                    onChange={(v) => setSecret('sslSmsToken', v)}
                  />
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Courier webhook bearer tokens */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-neutral-500" />
                Courier webhook tokens
              </span>
            }
            description="Bearer tokens that the couriers send back on their status webhooks. Generate any strong random string and configure the same value in each courier's merchant dashboard."
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>
                  Steadfast
                  {config.hasSecret.steadfastWebhookToken && (
                    <Badge tone="success" className="ml-2">saved</Badge>
                  )}
                </Label>
                <SecretInput
                  saved={config.hasSecret.steadfastWebhookToken}
                  value={secrets.steadfastWebhookToken}
                  onChange={(v) => setSecret('steadfastWebhookToken', v)}
                />
              </div>
              <div>
                <Label>
                  Pathao
                  {config.hasSecret.pathaoWebhookToken && (
                    <Badge tone="success" className="ml-2">saved</Badge>
                  )}
                </Label>
                <SecretInput
                  saved={config.hasSecret.pathaoWebhookToken}
                  value={secrets.pathaoWebhookToken}
                  onChange={(v) => setSecret('pathaoWebhookToken', v)}
                />
              </div>
              <div>
                <Label>
                  RedX
                  {config.hasSecret.redxWebhookToken && (
                    <Badge tone="success" className="ml-2">saved</Badge>
                  )}
                </Label>
                <SecretInput
                  saved={config.hasSecret.redxWebhookToken}
                  value={secrets.redxWebhookToken}
                  onChange={(v) => setSecret('redxWebhookToken', v)}
                />
              </div>
            </div>
            {webhookUrl && (
              <div className="pt-3 border-t border-neutral-100 space-y-2">
                <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                  Courier callback URLs
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <CopyField value={`${webhookUrl.replace(/\/$/, '')}/api/webhooks/steadfast`} label="Steadfast URL" />
                  <CopyField value={`${webhookUrl.replace(/\/$/, '')}/api/webhooks/pathao`} label="Pathao URL" />
                  <CopyField value={`${webhookUrl.replace(/\/$/, '')}/api/webhooks/redx`} label="RedX URL" />
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Footer actions */}
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 px-5 py-3 bg-white border border-neutral-200/80 rounded-xl shadow-pop">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            {config.ready.messengerWebhook ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            )}
            <span>
              {config.ready.messengerWebhook
                ? 'Messenger webhook is ready — connect a Facebook page from Settings.'
                : 'Save the Meta App Secret and Verify Token to enable the Messenger webhook.'}
            </span>
          </div>
          <Button onClick={save} loading={saving} leftIcon={<KeyRound className="w-4 h-4" />}>
            Save platform keys
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Shield, CheckCircle2, Link2, Link2Off, Loader2 } from 'lucide-react';

interface RazorpaySettings {
  connected: boolean;
  environment?: string;
  keyId?: string;
  hasWebhook?: boolean;
  lastValidatedAt?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<RazorpaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    keyId: '',
    keySecret: '',
    webhookSecret: '',
  });

  const fetchSettings = () => {
    fetch('/api/onboarding/razorpay')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load settings');
        return res.json();
      })
      .then(data => {
        setSettings(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error) setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, environment: 'TEST' })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to connect');
      }
      setForm({ keyId: '', keySecret: '', webhookSecret: '' });
      fetchSettings();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect? Active recoveries will fail.')) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/razorpay', {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to disconnect');
      }
      fetchSettings();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-500">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings & Connections</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your payment gateway credentials and preferences.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 p-4 rounded-md border border-red-200 text-red-700 flex items-center">
          <AlertCircle className="w-5 h-5 mr-3" />
          {error}
        </div>
      )}

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
            <Shield className="w-5 h-5 text-indigo-600 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Razorpay Integration</h3>
          </div>
          {settings?.connected ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              <Link2Off className="w-4 h-4 mr-1" /> Disconnected
            </span>
          )}
        </div>

        <div className="p-6">
          {settings?.connected ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500">Environment</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{settings.environment} MODE</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Key ID (Masked)</p>
                  <p className="mt-1 text-sm font-mono bg-gray-100 px-3 py-1 rounded inline-block text-gray-800 border border-gray-200">
                    {settings.keyId}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Webhook Status</p>
                  <p className="mt-1 text-sm text-gray-900 flex items-center">
                    {settings.hasWebhook ? (
                      <><CheckCircle2 className="w-4 h-4 text-emerald-500 mr-1"/> Configured</>
                    ) : (
                      <><AlertCircle className="w-4 h-4 text-amber-500 mr-1"/> Missing Webhook Secret</>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Last Validated</p>
                  <p className="mt-1 text-sm text-gray-900">
                    {settings.lastValidatedAt ? new Date(settings.lastValidatedAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={handleDisconnect}
                  disabled={submitting}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2Off className="w-4 h-4 mr-2" />}
                  Disconnect Integration
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
                <strong>Development Note:</strong> The platform is restricted to <strong>TEST MODE</strong> only. Please use your Razorpay Test Mode credentials.
              </div>
              
              <div className="grid grid-cols-1 gap-6 max-w-xl">
                <div>
                  <label htmlFor="keyId" className="block text-sm font-medium text-gray-700">Key ID</label>
                  <input
                    type="text"
                    id="keyId"
                    required
                    value={form.keyId}
                    onChange={e => setForm({ ...form, keyId: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="rzp_test_..."
                  />
                </div>
                <div>
                  <label htmlFor="keySecret" className="block text-sm font-medium text-gray-700">Key Secret</label>
                  <input
                    type="password"
                    id="keySecret"
                    required
                    value={form.keySecret}
                    onChange={e => setForm({ ...form, keySecret: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="webhookSecret" className="block text-sm font-medium text-gray-700">Webhook Secret (Optional)</label>
                  <input
                    type="password"
                    id="webhookSecret"
                    value={form.webhookSecret}
                    onChange={e => setForm({ ...form, webhookSecret: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Must match your Razorpay webhook settings"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
                  Connect & Validate
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

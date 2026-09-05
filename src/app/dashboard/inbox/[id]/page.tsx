'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { AlertCircle, BrainCircuit, ShieldCheck, Check, X, ArrowLeft, Loader2, Info } from 'lucide-react';
import Link from 'next/link';

interface Opp {
  id: string;
  actionId: string;
  type: string;
  sourceId: string;
  amountSubunits: number;
  currency: string;
  expectedRecoveryValue: number;
  priorityScore: number;
  recoveryProbability: number;
  recommendedAction: string;
  reasoning: string;
  evidence: unknown;
  detectedAt: string;
}

export default function OpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [opp, setOpp] = useState<Opp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  useEffect(() => {
    // We fetch from pending to find it, or we could have a specific endpoint.
    // For this Phase, since we have the pending list, we fetch pending and find it.
    fetch('/api/ui/opportunities/pending')
      .then(res => res.json())
      .then(data => {
        const found = data.find((d: Opp) => d.id === resolvedParams.id);
        if (found) setOpp(found);
        else setError('Opportunity not found or no longer pending.');
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [resolvedParams.id]);

  const handleAction = async (type: 'approve' | 'reject') => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ui/actions/${opp?.actionId}/${type}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Request failed');
      }
      router.push('/dashboard/inbox');
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      setSubmitting(false);
      setConfirmApprove(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-gray-500"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />Loading...</div>;
  if (error) return <div className="p-4 text-red-600 bg-red-50 rounded-md border border-red-200">{error}</div>;
  if (!opp) return null;

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <Link href="/dashboard/inbox" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Inbox
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-8 py-6 text-white flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 uppercase tracking-wider border border-indigo-500/30">
                {opp.type.replace(/_/g, ' ')}
              </span>
              <span className="text-slate-400 text-sm">ID: {opp.id}</span>
            </div>
            <h2 className="text-2xl font-bold">Recovery Proposal</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">At-Risk Amount</p>
            <p className="text-3xl font-bold text-white">₹{(opp.amountSubunits / 100).toFixed(2)}</p>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: Deterministic */}
          <div className="space-y-6">
            <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
              <h3 className="flex items-center text-sm font-bold text-gray-900 uppercase tracking-wide border-b border-gray-200 pb-3 mb-4">
                <ShieldCheck className="w-5 h-5 mr-2 text-emerald-600" />
                Deterministic Facts
              </h3>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-gray-500">Source Event ID</dt>
                  <dd className="font-mono text-gray-900 mt-1">{opp.sourceId}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Detected At</dt>
                  <dd className="text-gray-900 mt-1">{new Date(opp.detectedAt).toLocaleString()}</dd>
                </div>
                {opp.evidence ? (
                  <div>
                    <dt className="text-gray-500">Raw Evidence Metadata</dt>
                    <dd className="mt-1">
                      <pre className="bg-white p-3 rounded border border-gray-200 overflow-x-auto text-xs text-gray-600">
                        {JSON.stringify(opp.evidence, null, 2)}
                      </pre>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          {/* Right Column: AI Interpretation */}
          <div className="space-y-6">
            <div className="border border-indigo-100 rounded-lg p-5 bg-indigo-50/30 shadow-inner">
              <h3 className="flex items-center text-sm font-bold text-indigo-900 uppercase tracking-wide border-b border-indigo-100 pb-3 mb-4">
                <BrainCircuit className="w-5 h-5 mr-2 text-indigo-600" />
                AI Interpretation
              </h3>
              
              <div className="mb-4 bg-white p-3 rounded-md border border-indigo-100 text-sm text-indigo-800 flex items-start">
                <Info className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                <p>This is an AI-generated assessment and recommendation. It is not a guarantee of recovery.</p>
              </div>

              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-indigo-900/60 font-medium">Proposed Action</dt>
                  <dd className="font-semibold text-indigo-900 mt-1 text-lg">{opp.recommendedAction}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-indigo-900/60 font-medium">Recovery Probability</dt>
                    <dd className="font-bold text-indigo-900 mt-1 text-2xl">{(opp.recoveryProbability * 100).toFixed(0)}%</dd>
                  </div>
                  <div>
                    <dt className="text-indigo-900/60 font-medium">Expected Recovery</dt>
                    <dd className="font-bold text-emerald-600 mt-1 text-2xl">₹{(opp.expectedRecoveryValue / 100).toFixed(2)}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-indigo-900/60 font-medium">AI Reasoning</dt>
                  <dd className="text-indigo-900 mt-1 leading-relaxed bg-white p-4 rounded-md border border-indigo-100">
                    {opp.reasoning}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-8 py-6 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => handleAction('reject')}
            disabled={submitting}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          >
            <X className="w-4 h-4 mr-2" /> Reject Proposal
          </button>

          {!confirmApprove ? (
            <button
              onClick={() => setConfirmApprove(true)}
              disabled={submitting}
              className="inline-flex items-center px-6 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <Check className="w-4 h-4 mr-2" /> Approve Action
            </button>
          ) : (
            <div className="flex items-center space-x-3 bg-indigo-50 p-3 rounded-lg border border-indigo-200">
              <span className="text-sm font-medium text-indigo-800 mr-2">This will initiate the recovery execution via Razorpay TEST Mode. Confirm?</span>
              <button
                onClick={() => setConfirmApprove(false)}
                disabled={submitting}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction('approve')}
                disabled={submitting}
                className="inline-flex items-center px-4 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                Confirm Execution
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

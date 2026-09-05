"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  ShieldCheck,
  Loader2
} from "lucide-react";

type Metrics = {
  atRiskRevenue: number;
  expectedRecovery: number;
  verifiedRecovered: number;
  pendingCount: number;
  recoveredCount: number;
};

type Opportunity = {
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
};

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
  };

  const fetchData = async () => {
    try {
      const [metricsRes, oppsRes] = await Promise.all([
        fetch('/api/ui/dashboard/metrics'),
        fetch('/api/ui/opportunities/pending')
      ]);

      if (!metricsRes.ok || !oppsRes.ok) throw new Error("Failed to fetch data");

      const metricsData = await metricsRes.json();
      const oppsData = await oppsRes.json();

      setMetrics(metricsData);
      setOpportunities(oppsData);
      setError("");
    } catch (err: any /* eslint-disable-line */) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
        
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  const handleApprove = async (actionId: string) => {
    setProcessingId(actionId);
    setSuccessMsg("");
    setError("");
    try {
      const res = await fetch(`/api/ui/actions/${actionId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");
      
      setSuccessMsg("Action successfully approved and executed!");
      setSelectedOpp(null);
      await     
    fetchData();
    } catch (err: any /* eslint-disable-line */) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (actionId: string) => {
    setProcessingId(actionId);
    setSuccessMsg("");
    setError("");
    try {
      const res = await fetch(`/api/ui/actions/${actionId}/reject`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");
      
      setSuccessMsg("Action rejected successfully.");
      setSelectedOpp(null);
      await     
    fetchData();
    } catch (err: any /* eslint-disable-line */) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f8fb]">
        <Loader2 className="h-8 w-8 animate-spin text-[#116466]" />
      </div>
    );
  }


  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#16202a] font-sans">
      <header className="border-b border-[#dfe5ec] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <p className="text-sm font-medium text-[#116466]">
              Merchant Dashboard (Test Mode)
            </p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
              Revenue Recovery Command Center
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-[#cfd8e3] bg-[#f9fbfc] px-3 py-2 text-sm text-[#42505c]">
            <ShieldCheck className="h-4 w-4 text-[#116466]" />
            Authenticated as: merchant_test
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4 border border-red-200 text-red-800 flex items-center gap-3">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}
        
        {successMsg && (
          <div className="mb-6 rounded-md bg-green-50 p-4 border border-green-200 text-green-800 flex items-center gap-3">
            <CheckCircle className="h-5 w-5" />
            {successMsg}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3 mb-8">
          <div className="rounded-md border border-[#dfe5ec] bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#5e6b78]">At-risk Revenue</p>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{metrics ? formatCurrency(metrics.atRiskRevenue, 'INR') : '₹1'}</p>
            <p className="mt-2 text-sm text-[#6c7a87]">{metrics?.pendingCount || 0} pending opportunities</p>
          </div>
          <div className="rounded-md border border-[#dfe5ec] bg-white p-5">
            <div className="flex items-center justify-center">
              <p className="text-sm font-medium text-[#5e6b78]">Expected Recovery</p>
              <Activity className="h-5 w-5 text-blue-500" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{metrics ? formatCurrency(metrics.expectedRecovery, 'INR') : '₹0'}</p>
            <p className="mt-2 text-sm text-[#6c7a87]">Based on AI probability</p>
          </div>
          <div className="rounded-md border border-[#dfe5ec] bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[#5e6b78]">Verified Recovered</p>
              <Banknote className="h-5 w-5 text-green-600" />
            </div>
            <p className="mt-4 text-2xl font-semibold">{metrics ? formatCurrency(metrics.verifiedRecovered, 'INR') : '₹0'}</p>
            <p className="mt-2 text-sm text-[#6c7a87]">{metrics?.recoveredCount || 0} successfully recovered</p>
          </div>
        </section>

        <section className="bg-white rounded-md border border-[#dfe5ec] overflow-hidden">
          <div className="border-b border-[#dfe5ec] px-5 py-4 bg-[#f9fbfc]">
            <h2 className="text-lg font-semibold">Approval Inbox</h2>
            <p className="text-sm text-[#6c7a87]">Review AI-proposed recovery actions</p>
          </div>
          
          {opportunities.length === 0 ? (
            <div className="p-8 text-center text-[#6c7a87]">
              <CheckCircle className="mx-auto h-12 w-12 text-[#dfe5ec] mb-3" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-sm">No pending recovery opportunities at this time.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f0f4f8] text-[#5e6b78]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Detected</th>
                    <th className="px-5 py-3 font-medium">Amount at Risk</th>
                    <th className="px-5 py-3 font-medium">Priority Score</th>
                    <th className="px-5 py-3 font-medium">Expected Value</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5ec]">
                  {opportunities.map((opp) => (
                    <tr key={opp.id} className="hover:bg-[#f9fbfc]">
                      <td className="px-5 py-4 font-medium">{opp.type.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-4 text-[#6c7a87]">{new Date(opp.detectedAt).toLocaleString()}</td>
                      <td className="px-5 py-4">{formatCurrency(opp.amountSubunits, opp.currency)}</td>
                      <td className="px-5 py-4">
                        <span className={`'inline-flex' 'items-center' 'px-2' 'py-0.5' 'rounded' 'text-xs' 'font-medium' ${opp.priorityScore >= 80 ? 'bg-red-100 text-red-800' : opp.priorityScore >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                          {opp.priorityScore}/100
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#116466] font-medium">{formatCurrency(opp.expectedRecoveryValue, opp.currency)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                            onClick={() => setSelectedOpp(opp)}
                            className="inline-flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-[#42505c] border border-[#cfd8e3] hover:bg-[#f0f4f8] transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal for Details */}
        {selectedOpp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-[#dfe5ec] flex justify-between items-center bg-[#f9fbfc]">
                <h3 className="text-lg font-semibold">Opportunity Details</h3>
                <button onClick={() => setSelectedOpp(null)} className="text-[#6c7a87] hover:text-[#16202a]">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-[#f0f4f8] rounded-md p-4 border border-[#dfe5ec]">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#5e6b78] mb-3 flex items-center gap-1">
                      <ShieldCheck className="h-4 w-4" /> Deterministic Facts
                    </h4>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between"><dt className="text-[#6c7a87]">Type</dt><dd className="font-medium">{selectedOpp.type}</dd></div>
                      <div className="flex justify-between"><dt className="text-[#6c7a87]">Source ID</dt><dd className="font-medium truncate max-w-[150px]" title={selectedOpp.sourceId}>{selectedOpp.sourceId}</dd></div>
                      <div className="flex justify-between"><dt className="text-[#6c7a87]">Amount at Risk</dt><dd className="font-medium">{formatCurrency(selectedOpp.amountSubunits, selectedOpp.currency)}</dd></div>
                      <div className="flex justify-between"><dt className="text-[#6c7a87]">Expected Value</dt><dd className="font-medium text-[#116466]">{formatCurrency(selectedOpp.expectedRecoveryValue, selectedOpp.currency)}</dd></div>
                      <div className="flex justify-between"><dt className="text-[#6c7a87]">Priority Score</dt><dd className="font-medium">{selectedOpp.priorityScore}</dd></div>
                    </dl>
                  </div>

                  <div className="bg-[#f5f8ff] rounded-md p-4 border border-[#d6e4ff]">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800 mb-3 flex items-center gap-1">
                      <Activity className="h-4 w-4" /> AI Analysis
                    </h4>
                    <dl className="space-y-2 text-{&">
                      <div className="flex justify-between"><dt className="text-[#6c7a87]">Probability</dt><dd className="font-medium">{Math.round(selectedOpp.recoveryProbability * 100)}%</dd></div>
                      <div className="flex justify-between"><dt className="text-[#6c7a87]">Proposed Action</dt><dd className="font-medium">{selectedOpp.recommendedAction}</dd></div>
                    </dl>
                    <div className="mt-4 text-sm text-[#42505c]">
                      <p className="font-medium mb-1 text-blue-900">Reasoning:</p>
                      <p className="italic bg-white p-2 rounded border border-[#d6e4ff] text-xs">{selectedOpp.reasoning}</p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-[#dfe5ec] pt-6">
                  <h4 className="text-sm font-semibold mb-2">Raw Evidence Metadata</h4>
                  <pre className="bg-[#16202a] text-green-400 p-4 rounded-md text-xs overflow-x-auto">
                    {JSON.stringify(selectedOpp.evidence, null, 2)}
                  </pre>
                </div>
              </div>
              
              <div className="border-t border-[#dfe5ec] bg-[#f9fbfc] px-6 py-4 flex justify-end gap-3">
                <button
                  onClick={() => handleReject(selectedOpp.actionId)}
                  disabled={!!processingId}
                  className="px-4 py-2 rounded text-sm font-medium border border-[#cfd8e3] text-[#42505c] hover:bg-[#f0f4f8] disabled:opacity-50"
                >
                  {processingId === selectedOpp.actionId ? 'Processing...' : 'Reject Action'}
                </button>
                <button
                  onClick={() => handleApprove(selectedOpp.actionId)}
                  disabled={!!processingId}
                  className="px-4 py-2 rounded text-sm font-medium bg-[#116466] text-white hover:bg-[#0b4f51] disabled:opacity-50"
                >
                  {processingId === selectedOpp.actionId ? 'Processing...' : 'Approve & Execute'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

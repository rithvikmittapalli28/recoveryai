'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, IndianRupee, Activity, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface Metrics {
  atRiskRevenue: number;
  expectedRecovery: number;
  verifiedRecovered: number;
  pendingCount: number;
  recoveredCount: number;
}

export default function DashboardOverview() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ui/dashboard/metrics')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load metrics');
        return res.json();
      })
      .then(data => {
        setMetrics(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md border border-red-200 text-red-700 flex items-center">
        <AlertCircle className="w-5 h-5 mr-3" />
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
        <p className="mt-1 text-sm text-gray-500">
          Financial calculations are securely authoritative and processed server-side.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* At Risk */}
        <div className="bg-white overflow-hidden rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex items-center">
              <div className="bg-red-100 p-3 rounded-lg">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">At-Risk Revenue</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-bold text-gray-900">
                      {loading ? '...' : `₹${((metrics?.atRiskRevenue || 0) / 100).toFixed(2)}`}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-3 text-sm">
            <span className="text-gray-500">Total volume of open opportunities</span>
          </div>
        </div>

        {/* Expected Recovery */}
        <div className="bg-white overflow-hidden rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex items-center">
              <div className="bg-amber-100 p-3 rounded-lg">
                <Activity className="h-6 w-6 text-amber-600" />
              </div>
              <div className="ml-4 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Expected Recovery</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-bold text-gray-900">
                      {loading ? '...' : `₹${((metrics?.expectedRecovery || 0) / 100).toFixed(2)}`}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-3 text-sm">
            <span className="text-gray-500">AI-predicted value pending approval</span>
          </div>
        </div>

        {/* Verified Recovered */}
        <div className="bg-white overflow-hidden rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex items-center">
              <div className="bg-emerald-100 p-3 rounded-lg">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="ml-4 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Verified Recovered</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-bold text-gray-900">
                      {loading ? '...' : `₹${((metrics?.verifiedRecovered || 0) / 100).toFixed(2)}`}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-3 text-sm flex justify-between">
            <span className="text-gray-500">Confirmed by Razorpay</span>
            <span className="text-emerald-600 font-medium">{loading ? 0 : metrics?.recoveredCount} actions</span>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-8 text-center mt-8">
        <IndianRupee className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">Action Inbox</h3>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          You have {loading ? '...' : metrics?.pendingCount} opportunities requiring your explicit Human-in-the-Loop approval before recovery can begin.
        </p>
        <div className="mt-6">
          <Link href="/dashboard/inbox" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            Review Opportunities
          </Link>
        </div>
      </div>
    </div>
  );
}

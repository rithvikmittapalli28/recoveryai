'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, IndianRupee, ArrowRight, BrainCircuit, Activity } from 'lucide-react';

interface ActionableOpportunity {
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
  detectedAt: string;
}

export default function ActionInbox() {
  const [opportunities, setOpportunities] = useState<ActionableOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ui/opportunities/pending?limit=20')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load opportunities');
        return res.json();
      })
      .then(data => {
        setOpportunities(data);
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
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Action Inbox</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review and approve AI-recommended recovery actions.
        </p>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading opportunities...</div>
        ) : opportunities.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircleIcon className="mx-auto h-12 w-12 text-emerald-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Inbox Zero</h3>
            <p className="mt-2 text-sm text-gray-500">No pending recovery opportunities require your approval.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {opportunities.map(opp => (
              <div key={opp.id} className="p-6 hover:bg-gray-50 transition-colors flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                      {opp.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm font-medium text-gray-500 flex items-center">
                      <BrainCircuit className="w-4 h-4 mr-1 text-indigo-400" />
                      Score: {opp.priorityScore?.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(opp.detectedAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 max-w-md mt-4">
                    <div>
                      <p className="text-xs text-gray-500">At-Risk Amount</p>
                      <p className="text-lg font-semibold text-gray-900">₹{(opp.amountSubunits / 100).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 flex items-center">
                        <Activity className="w-3 h-3 mr-1" /> Expected Recovery
                      </p>
                      <p className="text-lg font-semibold text-emerald-600">₹{(opp.expectedRecoveryValue / 100).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="ml-6 flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{opp.recommendedAction}</p>
                    <p className="text-xs text-gray-500">Proposed Action</p>
                  </div>
                  <Link 
                    href={`/dashboard/inbox/${opp.id}`}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    Review <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckCircleIcon(props: any) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

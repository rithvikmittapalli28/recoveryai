'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, XCircle, ArrowRightCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface RecoveryStatusItem {
  id: string;
  source: string;
  amountSubunits: number;
  currency: string;
  status: string;
  detectedAt: string;
  actions: {
    id: string;
    actionType: string;
    status: string;
    expectedRecoveryValue: number | null;
    updatedAt: string;
  }[];
}

export default function RecoveryStatus() {
  const [items, setItems] = useState<RecoveryStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ui/opportunities/recovery-status?limit=50')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load recovery status');
        return res.json();
      })
      .then(data => {
        setItems(data.data || []);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RECOVERED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle className="w-3 h-3 mr-1" /> Recovered</span>;
      case 'EXECUTING':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><ArrowRightCircle className="w-3 h-3 mr-1 animate-pulse" /> Executing</span>;
      case 'FAILED':
      case 'DECLINED':
      case 'EXPIRED':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" /> {status}</span>;
      case 'ACTION_PROPOSED':
      case 'PENDING_APPROVAL':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><Clock className="w-3 h-3 mr-1" /> Pending Approval</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Recovery Status</h2>
        <p className="mt-1 text-sm text-gray-500">
          Track the status of approved recovery actions and finalized recoveries.
        </p>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading status...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No recent activity.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opportunity</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item) => {
                  const action = item.actions[0]; // Assuming most recent action
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{item.source.replace(/_/g, ' ')}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">{item.id.substring(0, 12)}...</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">₹{(item.amountSubunits / 100).toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {action ? (
                          <>
                            <span className="font-medium text-gray-900">{action.actionType}</span>
                            <div className="text-xs mt-1">{getStatusBadge(action.status)}</div>
                          </>
                        ) : (
                          'None'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(action?.updatedAt || item.detectedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

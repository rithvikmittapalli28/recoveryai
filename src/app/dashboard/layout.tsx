import Link from 'next/link';
import { Home, Inbox, CheckCircle, Settings, LogOut, ShieldAlert } from 'lucide-react';
import { getAuthenticatedMerchantId } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let merchantId: string;
  try {
    // We import headers and cookie to pass the request context
    const { headers } = await import('next/headers');
    const req = new Request('http://localhost', { headers: await headers() });
    merchantId = await getAuthenticatedMerchantId(req);
  } catch (err) {
    redirect('/'); // Go to login if unauthenticated
  }

  return (
    <div className="flex h-screen bg-gray-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl flex-shrink-0 relative z-20">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
          <ShieldAlert className="w-6 h-6 text-indigo-400 mr-3" />
          <span className="text-white font-bold text-lg tracking-tight">RecoverAI</span>
        </div>
        
        <div className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Merchant Panel
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <Link href="/dashboard" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md hover:bg-slate-800 hover:text-white transition-colors group">
            <Home className="mr-3 h-5 w-5 text-slate-400 group-hover:text-indigo-400" />
            Overview
          </Link>
          <Link href="/dashboard/inbox" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md hover:bg-slate-800 hover:text-white transition-colors group">
            <Inbox className="mr-3 h-5 w-5 text-slate-400 group-hover:text-indigo-400" />
            Action Inbox
          </Link>
          <Link href="/dashboard/recovery" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md hover:bg-slate-800 hover:text-white transition-colors group">
            <CheckCircle className="mr-3 h-5 w-5 text-slate-400 group-hover:text-indigo-400" />
            Recovery Status
          </Link>
          <Link href="/dashboard/settings" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md hover:bg-slate-800 hover:text-white transition-colors group">
            <Settings className="mr-3 h-5 w-5 text-slate-400 group-hover:text-indigo-400" />
            Settings & Keys
          </Link>
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center px-3 py-2 text-sm">
            <div className="flex-1 truncate">
              <p className="text-xs text-slate-500">Authenticated as</p>
              <p className="text-sm font-medium text-white truncate" title={merchantId}>{merchantId}</p>
            </div>
          </div>
          <Link href="/api/auth/logout" className="mt-2 flex items-center px-3 py-2 text-sm font-medium rounded-md text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors">
            <LogOut className="mr-3 h-4 w-4" />
            Sign Out
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10 bg-gray-50">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-800">Revenue Recovery Dashboard</h1>
        </header>
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

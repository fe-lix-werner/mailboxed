import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { Play, RefreshCcw, CheckCircle, XCircle, Clock, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const { data: mailboxes, isLoading: mailboxesLoading } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: api.mailboxes.list,
  });

  const { data: recentJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', { limit: 5 }],
    queryFn: () => api.jobs.list({ limit: 5 }),
    refetchInterval: 5000,
  });

  const syncMutation = useMutation({
    mutationFn: api.mailboxes.sync,
    onSuccess: () => {
      // Invalidate queries to refresh status
    }
  });

  if (mailboxesLoading || jobsLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <RefreshCcw className="animate-spin text-primary-500" size={32} />
        <p className="text-slate-500 font-medium">Loading Dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-12">
      <header>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-2 text-lg">Overview of your synced mailboxes and recent activity.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {mailboxes?.map((mailbox: any) => (
          <div key={mailbox.id} className="card group">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-bold text-xl text-slate-900 group-hover:text-primary-600 transition-colors">{mailbox.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{mailbox.username}</p>
                </div>
                <span className={`badge ${mailbox.enabled ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                  {mailbox.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Poll Interval</span>
                  <span className="text-slate-900 font-semibold">{mailbox.pollIntervalSec / 60}m</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Sync Mode</span>
                  <span className="text-slate-900 font-semibold capitalize">{mailbox.syncMode.replace('_', ' ')}</span>
                </div>
              </div>

              <button 
                onClick={() => syncMutation.mutate(mailbox.id)}
                disabled={syncMutation.isPending}
                className="w-full btn-primary py-3 gap-3"
              >
                {syncMutation.isPending ? (
                  <RefreshCcw size={18} className="animate-spin" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
                Sync Now
              </button>
            </div>
          </div>
        ))}

        <button className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/30 transition-all duration-300 group">
           <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary-100 transition-all">
             <span className="text-2xl">+</span>
           </div>
           <span className="font-bold">Add Mailbox</span>
        </button>
      </div>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900">Recent Jobs</h2>
        <div className="card shadow-sm border-slate-200/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mailbox</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Trigger</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Started</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Duration</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Stats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentJobs?.map((job: any) => (
                  <tr key={job.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5 text-sm text-slate-900 font-bold">{job.mailboxId}</td>
                    <td className="px-8 py-5">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        {job.trigger}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500 font-medium">
                      {formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500">
                      {job.finishedAt ? (
                        <span className="flex items-center gap-1.5 font-mono">
                          <Clock size={14} className="text-slate-300" />
                          {Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-8 py-5">
                      {job.status === 'success' && <div className="flex items-center gap-2 text-green-600 font-bold text-xs"><CheckCircle size={16}/> SUCCESS</div>}
                      {job.status === 'failed' && <div className="flex items-center gap-2 text-red-600 font-bold text-xs" title={job.errorText}><XCircle size={16}/> FAILED</div>}
                      {job.status === 'running' && <div className="flex items-center gap-2 text-primary-600 font-bold text-xs"><RefreshCcw size={16} className="animate-spin"/> RUNNING</div>}
                      {job.status === 'pending' && <div className="flex items-center gap-2 text-slate-400 font-bold text-xs"><Clock size={16}/> PENDING</div>}
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-900 text-right font-medium">
                      {job.statsJson ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-green-600">{JSON.parse(job.statsJson).saved} saved</span>
                          {JSON.parse(job.statsJson).errors > 0 && <span className="text-red-400 text-[10px]">{JSON.parse(job.statsJson).errors} err</span>}
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
                {recentJobs?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-8 py-16 text-center text-slate-400 italic font-medium">
                      <div className="flex flex-col items-center gap-2">
                        <History size={40} className="text-slate-100" />
                        No sync history recorded yet.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

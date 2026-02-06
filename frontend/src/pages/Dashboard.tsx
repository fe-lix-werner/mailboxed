import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { Play, RefreshCcw, CheckCircle, XCircle, Clock, History, FileText, HardDrive, Zap, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: mailboxes, isLoading: mailboxesLoading } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: api.mailboxes.list,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats.get,
    refetchInterval: 10000,
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

  if (mailboxesLoading || jobsLoading || statsLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <RefreshCcw className="animate-spin text-primary-500" size={32} />
        <p className="text-slate-500 font-medium">{t('common.loading')}</p>
      </div>
    </div>
  );

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-12">
      <header>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-slate-500 mt-2 text-lg">{t('dashboard.subtitle')}</p>
      </header>

      {/* Stats Overview */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 border-slate-200/50 flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
            <FileText size={24} />
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">{t('dashboard.stats.totalFiles')}</span>
            <span className="text-2xl font-black text-slate-900">{stats?.totalFiles || 0}</span>
          </div>
        </div>
        <div className="card p-6 border-slate-200/50 flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-sm">
            <HardDrive size={24} />
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">{t('dashboard.stats.totalSize')}</span>
            <span className="text-2xl font-black text-slate-900">{formatSize(stats?.totalSize || 0)}</span>
          </div>
        </div>
        <div className="card p-6 border-slate-200/50 flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center shadow-sm">
            <ShieldCheck size={24} />
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">{t('dashboard.stats.successRate')}</span>
            <span className="text-2xl font-black text-slate-900">{stats?.successRate || 0}%</span>
          </div>
        </div>
        <div className="card p-6 border-slate-200/50 flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
            <Zap size={24} />
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">{t('dashboard.stats.activeMailboxes')}</span>
            <span className="text-2xl font-black text-slate-900">{stats?.activeMailboxes || 0} / {stats?.mailboxCount || 0}</span>
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card p-8 border-slate-200/50">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{t('dashboard.stats.history')}</h2>
              <p className="text-sm text-slate-500">{t('dashboard.historySubtitle')}</p>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <History size={20} />
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.history || []}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(str) => {
                    const date = new Date(str);
                    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                  }}
                  minTickGap={30}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  label={{ value: t('dashboard.stats.totalFiles'), angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' } }}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    fontWeight: '600'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-8 border-slate-200/50">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{t('dashboard.stats.mimeBreakdown')}</h2>
              <p className="text-sm text-slate-500">{t('dashboard.mimeSubtitle')}</p>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <FileText size={20} />
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.mimeBreakdown || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(stats?.mimeBreakdown || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={((value: any, name: any) => [value, t(`dashboard.mime.${String(name)}`, { defaultValue: String(name) })]) as any}
                   contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    fontWeight: '600'
                  }} 
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

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
                  {mailbox.enabled ? t('common.enabled') : t('common.disabled')}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">{t('dashboard.pollInterval')}</span>
                  <span className="text-slate-900 font-semibold">{mailbox.pollIntervalSec / 60}m</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">{t('dashboard.syncMode')}</span>
                  <span className="text-slate-900 font-semibold capitalize">{mailbox.syncMode.replace('_', ' ')}</span>
                </div>
              </div>

              <button 
                onClick={() => syncMutation.mutate(mailbox.id)}
                disabled={syncMutation.isPending}
                className="w-full btn-primary py-3 gap-3 cursor-pointer"
              >
                {syncMutation.isPending ? (
                  <RefreshCcw size={18} className="animate-spin" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
                {t('common.syncNow')}
              </button>
            </div>
          </div>
        ))}

        <Link 
          to="/mailboxes/new"
          className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/30 transition-all duration-300 group text-center"
        >
           <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary-100 transition-all">
             <span className="text-2xl">+</span>
           </div>
           <span className="font-bold">{t('dashboard.addMailbox')}</span>
        </Link>
      </div>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900">{t('dashboard.recentJobs')}</h2>
        <div className="card shadow-sm border-slate-200/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('jobs.mailbox')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('jobs.trigger')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('jobs.started')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('jobs.duration')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('jobs.status')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">{t('jobs.stats')}</th>
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
                      {job.status === 'success' && <div className="flex items-center gap-2 text-green-600 font-bold text-xs"><CheckCircle size={16}/> {t('jobs.success')}</div>}
                      {job.status === 'failed' && <div className="flex items-center gap-2 text-red-600 font-bold text-xs" title={job.errorText}><XCircle size={16}/> {t('jobs.failed')}</div>}
                      {job.status === 'running' && <div className="flex items-center gap-2 text-primary-600 font-bold text-xs"><RefreshCcw size={16} className="animate-spin"/> {t('jobs.running')}</div>}
                      {job.status === 'pending' && <div className="flex items-center gap-2 text-slate-400 font-bold text-xs"><Clock size={16}/> {t('jobs.pending')}</div>}
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-900 text-right font-medium">
                      {job.statsJson ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-green-600">{JSON.parse(job.statsJson).saved} {t('jobs.saved')}</span>
                          {JSON.parse(job.statsJson).errors > 0 && <span className="text-red-400 text-[10px]">{JSON.parse(job.statsJson).errors} {t('jobs.errors')}</span>}
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
                        {t('dashboard.noJobs')}
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

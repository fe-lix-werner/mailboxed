import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ChevronLeft, Save, Shield, Server, Filter, Clock, RefreshCcw } from 'lucide-react';

export default function MailboxEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === 'new';

  const { data: mailbox, isLoading } = useQuery({
    queryKey: ['mailboxes', id],
    queryFn: () => api.mailboxes.get(parseInt(id!)),
    enabled: !isNew,
  });

  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    values: mailbox || {
      name: '',
      host: '',
      port: 993,
      tlsMode: 'tls',
      username: '',
      password: '',
      basePath: '',
      folderListJson: ['INBOX'],
      syncMode: 'from_now_on',
      pollIntervalSec: 600,
      enabled: true,
      busyPolicy: 'skip',
    }
  });

  const mutation = useMutation({
    mutationFn: (data: any) => isNew ? api.mailboxes.create(data) : api.mailboxes.update(parseInt(id!), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      navigate('/mailboxes');
    }
  });

  if (!isNew && isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <RefreshCcw className="animate-spin text-primary-500" size={32} />
        <p className="text-slate-500 font-medium">Loading configuration...</p>
      </div>
    </div>
  );

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-10 pb-20">
      <header className="flex items-center gap-6">
        <button 
          onClick={() => navigate(-1)} 
          className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all group"
        >
          <ChevronLeft size={24} className="text-slate-400 group-hover:text-slate-900 transition-colors" />
        </button>
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{isNew ? 'New Mailbox' : 'Edit Mailbox'}</h1>
          <p className="text-slate-500 mt-1 text-lg">Configure your IMAP connection and sync preferences.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit(data => mutation.mutate(data))} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Connection Settings */}
            <section className="card border-slate-200/50">
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                  <Server size={18} />
                </div>
                <h2 className="font-bold text-slate-900 uppercase tracking-wider text-xs">Connection Settings</h2>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Display Name</label>
                  <input {...register('name', { required: true })} className="input h-12 text-lg font-medium" placeholder="Personal Gmail, Office 365..." />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">IMAP Host</label>
                  <input {...register('host', { required: true })} className="input h-11" placeholder="imap.gmail.com" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Port</label>
                    <input type="number" {...register('port', { valueAsNumber: true })} className="input h-11" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">TLS Mode</label>
                    <select {...register('tlsMode')} className="input h-11 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25em_1.25em] bg-[right_0.5rem_center] bg-no-repeat">
                      <option value="tls">SSL/TLS</option>
                      <option value="starttls">STARTTLS</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Username / Email</label>
                  <input {...register('username', { required: true })} className="input h-11" placeholder="user@example.com" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Password</label>
                  <input type="password" {...register('password', { required: isNew })} className="input h-11" placeholder={isNew ? "••••••••" : "Leave blank to keep current"} />
                </div>
              </div>
            </section>

            {/* Storage & Rules */}
            <section className="card border-slate-200/50">
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg">
                  <Filter size={18} />
                </div>
                <h2 className="font-bold text-slate-900 uppercase tracking-wider text-xs">Storage & Filters</h2>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Base Download Path</label>
                  <div className="relative group">
                    <input {...register('basePath')} className="input h-11 pl-4" placeholder="/attachments/work" />
                    <p className="mt-2 text-xs text-slate-400 font-medium">Relative to global root. Folders will be created as <code className="bg-slate-100 px-1 rounded text-slate-600 italic">/{watch('name') || 'Mailbox'}/YYYY/MM/</code></p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-8">
            {/* Sync Logic */}
            <section className="card border-slate-200/50">
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
                  <Clock size={18} />
                </div>
                <h2 className="font-bold text-slate-900 uppercase tracking-wider text-xs">Automation</h2>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Initial Sync Mode</label>
                  <div className="grid grid-cols-1 gap-2">
                    <label className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${watch('syncMode') === 'from_now_on' ? 'border-primary-500 bg-primary-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" value="from_now_on" {...register('syncMode')} className="w-4 h-4 text-primary-600 border-slate-300 focus:ring-primary-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-900">From Now On</span>
                        <span className="text-[10px] text-slate-500 font-medium leading-none">Only scan new incoming mail</span>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${watch('syncMode') === 'everything' ? 'border-primary-500 bg-primary-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" value="everything" {...register('syncMode')} className="w-4 h-4 text-primary-600 border-slate-300 focus:ring-primary-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-900">Everything</span>
                        <span className="text-[10px] text-slate-500 font-medium leading-none">Full historical scan (slower)</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Poll Interval</label>
                  <div className="flex items-center gap-4">
                    <input type="number" {...register('pollIntervalSec', { valueAsNumber: true })} className="input h-11 text-center font-bold" />
                    <span className="text-sm font-bold text-slate-400">SEC</span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic">Recommended: 600s (10 min)</p>
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button 
                type="submit" 
                disabled={mutation.isPending}
                className="btn-primary h-14 w-full text-lg shadow-xl shadow-primary-200 gap-3"
              >
                {mutation.isPending ? (
                  <RefreshCcw size={20} className="animate-spin" />
                ) : (
                  <>
                    <Save size={20} fill="currentColor" />
                    {isNew ? 'Create Mailbox' : 'Save Changes'}
                  </>
                )}
              </button>
              <button 
                type="button" 
                onClick={() => navigate(-1)}
                className="btn-secondary h-12 w-full"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

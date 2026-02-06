import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Plus, Settings, Trash2, CheckCircle2, XCircle, Play, Pause, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Mailboxes() {
  const queryClient = useQueryClient();
  const { data: mailboxes, isLoading } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: api.mailboxes.list,
  });

  const deleteMutation = useMutation({
    mutationFn: api.mailboxes.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mailboxes'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => 
      api.mailboxes.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mailboxes'] }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <RefreshCcw className="animate-spin text-primary-500" size={32} />
        <p className="text-slate-500 font-medium">Loading Mailboxes...</p>
      </div>
    </div>
  );

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-10">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Mailboxes</h1>
          <p className="text-slate-500 mt-2 text-lg">Manage your IMAP connections and sync rules.</p>
        </div>
        <Link 
          to="/mailboxes/new"
          className="btn-primary gap-2 h-12 px-6"
        >
          <Plus size={20} />
          Add Mailbox
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {mailboxes?.map((mailbox: any) => (
          <div key={mailbox.id} className="card group p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 border-slate-200/50">
            <div className="flex items-center gap-6">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                mailbox.enabled 
                  ? 'bg-primary-50 text-primary-600 group-hover:bg-primary-600 group-hover:text-white group-hover:rotate-3 group-hover:shadow-lg group-hover:shadow-primary-200' 
                  : 'bg-slate-100 text-slate-400'
              }`}>
                <Settings size={32} />
              </div>
              <div>
                <h3 className="font-bold text-2xl text-slate-900">{mailbox.name}</h3>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    {mailbox.username}
                  </span>
                  <span className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    {mailbox.host}:{mailbox.port}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end mr-6">
                <span className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Status</span>
                <span className={`text-sm font-bold ${mailbox.enabled ? 'text-green-600' : 'text-slate-400'}`}>
                  {mailbox.enabled ? 'ACTIVE' : 'PAUSED'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => toggleMutation.mutate({ id: mailbox.id, enabled: !mailbox.enabled })}
                  className={`btn w-11 h-11 p-0 border rounded-xl transition-all duration-300 ${
                    mailbox.enabled 
                      ? 'bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-600 hover:text-white' 
                      : 'bg-green-50 border-green-100 text-green-600 hover:bg-green-600 hover:text-white'
                  }`}
                  title={mailbox.enabled ? "Pause" : "Resume"}
                >
                  {mailbox.enabled ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>

                <Link 
                  to={`/mailboxes/${mailbox.id}`}
                  className="btn-secondary w-11 h-11 p-0 rounded-xl hover:border-primary-200 hover:text-primary-600 transition-all duration-300"
                  title="Edit Settings"
                >
                  <Settings size={20} />
                </Link>

                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this mailbox? All history will be kept but sync will stop.')) {
                      deleteMutation.mutate(mailbox.id);
                    }
                  }}
                  className="btn-danger w-11 h-11 p-0 rounded-xl hover:bg-red-600 hover:text-white transition-all duration-300"
                  title="Delete Mailbox"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {mailboxes?.length === 0 && (
          <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Settings size={40} className="text-slate-200" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">No mailboxes yet</h3>
            <p className="text-slate-500 mb-8 max-w-sm">Connect your first IMAP account to start automatically archiving email attachments.</p>
            <Link 
              to="/mailboxes/new"
              className="btn-primary px-8 py-3 rounded-xl gap-2 shadow-lg shadow-primary-100"
            >
              <Plus size={20} />
              Connect a Mailbox
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

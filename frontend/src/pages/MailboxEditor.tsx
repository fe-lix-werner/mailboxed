import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ChevronLeft, Save, Shield, Server, Filter, Clock, RefreshCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function MailboxEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isNew = !id || id === 'new';
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [connectionTested, setConnectionTested] = useState(false);

  const { data: mailbox, isLoading } = useQuery({
    queryKey: ['mailboxes', id],
    queryFn: () => api.mailboxes.get(parseInt(id!)),
    enabled: !isNew,
  });

  const { register, handleSubmit, formState: { errors, isValid }, watch, setValue } = useForm({
    mode: 'onChange',
    values: mailbox ? {
      ...mailbox,
      allowedExtensions: mailbox.filtersJson ? (JSON.parse(mailbox.filtersJson).extensions?.join(', ') || '') : '',
      allowedMimes: mailbox.filtersJson ? (JSON.parse(mailbox.filtersJson).mimes?.join(', ') || '') : '',
    } : {
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
      allowedExtensions: '',
      allowedMimes: '',
    }
  });

  const watchedFields = watch(['host', 'port', 'tlsMode', 'username', 'password']);
  
  useEffect(() => {
    setConnectionTested(false);
    setTestStatus('idle');
  }, [watchedFields[0], watchedFields[1], watchedFields[2], watchedFields[3], watchedFields[4]]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        ...data,
        filtersJson: JSON.stringify({
          extensions: data.allowedExtensions ? data.allowedExtensions.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          mimes: data.allowedMimes ? data.allowedMimes.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        })
      };
      delete payload.allowedExtensions;
      delete payload.allowedMimes;
      return isNew ? api.mailboxes.create(payload) : api.mailboxes.update(parseInt(id!), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      navigate('/mailboxes');
    }
  });

  const setSuggestion = (type: 'pdf' | 'images' | 'docs' | 'reset') => {
    if (type === 'pdf') {
      setValue('allowedExtensions', 'pdf');
      setValue('allowedMimes', 'application/pdf');
    } else if (type === 'images') {
      setValue('allowedExtensions', 'jpg, jpeg, png, gif');
      setValue('allowedMimes', 'image/*');
    } else if (type === 'docs') {
      setValue('allowedExtensions', 'doc, docx, xls, xlsx, ppt, pptx, pdf');
      setValue('allowedMimes', 'application/msword, application/vnd.openxmlformats-officedocument.*, application/pdf');
    } else if (type === 'reset') {
      setValue('allowedExtensions', '');
      setValue('allowedMimes', '');
    }
  };

  const testConnection = async () => {
    const data = watch();
    setTestStatus('loading');
    setTestError(null);
    try {
      const result = await api.mailboxes.test({
        id: isNew ? undefined : parseInt(id!),
        host: data.host,
        port: data.port,
        tlsMode: data.tlsMode,
        username: data.username,
        password: data.password || undefined,
      });
      if (result.success) {
        setTestStatus('success');
        setConnectionTested(true);
      } else {
        setTestStatus('error');
        setTestError(result.error || 'Connection failed');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestError(err.message);
    }
  };

  if (!isNew && isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <RefreshCcw className="animate-spin text-primary-500" size={32} />
        <p className="text-slate-500 font-medium">{t('editor.loadingConfig')}</p>
      </div>
    </div>
  );

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-10 pb-20">
      <header className="flex items-center gap-6">
        <button 
          onClick={() => navigate(-1)} 
          className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all group cursor-pointer"
        >
          <ChevronLeft size={24} className="text-slate-400 group-hover:text-slate-900 transition-colors" />
        </button>
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{isNew ? t('editor.newTitle') : t('editor.editTitle')}</h1>
          <p className="text-slate-500 mt-1 text-lg">{t('editor.subtitle')}</p>
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
                <h2 className="font-bold text-slate-900 uppercase tracking-wider text-xs">{t('editor.connectionSettings')}</h2>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.displayName')}</label>
                  <input {...register('name', { required: t('editor.required') })} className={`input h-12 text-lg font-medium ${errors.name ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="Personal Gmail, Office 365..." />
                  {errors.name && <p className="mt-1 text-xs text-red-500 font-bold">{errors.name.message as string}</p>}
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.imapHost')}</label>
                  <input {...register('host', { required: t('editor.required') })} className={`input h-11 ${errors.host ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="imap.gmail.com" />
                  {errors.host && <p className="mt-1 text-xs text-red-500 font-bold">{errors.host.message as string}</p>}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.port')}</label>
                    <input type="number" {...register('port', { required: t('editor.required'), valueAsNumber: true })} className={`input h-11 ${errors.port ? 'border-red-500 focus:ring-red-500' : ''}`} />
                    {errors.port && <p className="mt-1 text-xs text-red-500 font-bold">{errors.port.message as string}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.tlsMode')}</label>
                    <select {...register('tlsMode')} className="input h-11 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25em_1.25em] bg-[right_0.5rem_center] bg-no-repeat">
                      <option value="tls">SSL/TLS</option>
                      <option value="starttls">STARTTLS</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.username')}</label>
                  <input {...register('username', { required: t('editor.required') })} className={`input h-11 ${errors.username ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder="user@example.com" />
                  {errors.username && <p className="mt-1 text-xs text-red-500 font-bold">{errors.username.message as string}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.password')}</label>
                  <input type="password" {...register('password', { required: isNew ? t('editor.required') : false })} className={`input h-11 ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`} placeholder={isNew ? "••••••••" : t('editor.passwordPlaceholder')} />
                  {errors.password && <p className="mt-1 text-xs text-red-500 font-bold">{errors.password.message as string}</p>}
                </div>

                <div className="md:col-span-2 pt-4">
                  <button 
                    type="button" 
                    onClick={testConnection}
                    disabled={testStatus === 'loading' || !watchedFields[0] || !watchedFields[3]}
                    className={`w-full h-11 flex items-center justify-center gap-2 rounded-xl font-bold text-sm transition-all border-2 ${
                      testStatus === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
                      testStatus === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                      'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {testStatus === 'loading' ? <RefreshCcw size={16} className="animate-spin" /> : 
                     testStatus === 'success' ? <CheckCircle2 size={16} /> :
                     testStatus === 'error' ? <AlertCircle size={16} /> : 
                     <Shield size={16} />}
                    {testStatus === 'loading' ? t('editor.testing') : 
                     testStatus === 'success' ? t('editor.connectionSuccessful') : 
                     testStatus === 'error' ? t('editor.connectionFailed') :
                     t('editor.testConnection')}
                  </button>
                  {testError && <p className="mt-2 text-xs text-red-500 font-medium text-center">{testError}</p>}
                </div>
              </div>
            </section>

            {/* Storage & Rules */}
            <section className="card border-slate-200/50">
              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="p-1.5 bg-green-100 text-green-600 rounded-lg">
                  <Filter size={18} />
                </div>
                <h2 className="font-bold text-slate-900 uppercase tracking-wider text-xs">{t('editor.storageFilters')}</h2>
              </div>
              <div className="p-8 space-y-8">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.baseDownloadPath')}</label>
                  <input {...register('basePath')} className="input h-11 font-mono text-sm" placeholder="e.g. invoices/primary" />
                  <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic">
                    {t('editor.baseDownloadPathHint')} <code className="text-primary-500 font-black">downloads/&lt;path&gt;/YYYY-MM/filename</code>
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">{t('editor.filters')}</label>
                    <div className="flex gap-1.5">
                       <button type="button" onClick={() => setSuggestion('pdf')} className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-600 transition-colors">{t('editor.suggestPdf')}</button>
                       <button type="button" onClick={() => setSuggestion('images')} className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-600 transition-colors">{t('editor.suggestImages')}</button>
                       <button type="button" onClick={() => setSuggestion('docs')} className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-600 transition-colors">{t('editor.suggestDocs')}</button>
                       <button type="button" onClick={() => setSuggestion('reset')} className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">{t('editor.suggestReset')}</button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('editor.allowedExtensions')}</label>
                      <input {...register('allowedExtensions')} className="input h-11 text-sm" placeholder="pdf, docx, jpg..." />
                      <p className="mt-1.5 text-[10px] text-slate-400 font-medium italic">{t('editor.allowedExtensionsHint')}</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t('editor.allowedMimes')}</label>
                      <input {...register('allowedMimes')} className="input h-11 text-sm" placeholder="application/pdf, image/*..." />
                      <p className="mt-1.5 text-[10px] text-slate-400 font-medium italic">{t('editor.allowedMimesHint')}</p>
                    </div>
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
                <h2 className="font-bold text-slate-900 uppercase tracking-wider text-xs">{t('editor.automation')}</h2>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.initialSyncMode')}</label>
                  <div className="grid grid-cols-1 gap-2">
                    <label className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${watch('syncMode') === 'from_now_on' ? 'border-primary-500 bg-primary-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" value="from_now_on" {...register('syncMode')} className="w-4 h-4 text-primary-600 border-slate-300 focus:ring-primary-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-900">{t('editor.fromNowOn')}</span>
                        <span className="text-[10px] text-slate-500 font-medium leading-none">{t('editor.fromNowOnHint')}</span>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${watch('syncMode') === 'everything' ? 'border-primary-500 bg-primary-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" value="everything" {...register('syncMode')} className="w-4 h-4 text-primary-600 border-slate-300 focus:ring-primary-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-900">{t('editor.everything')}</span>
                        <span className="text-[10px] text-slate-500 font-medium leading-none">{t('editor.everythingHint')}</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('editor.pollInterval')}</label>
                  <div className="flex items-center gap-4">
                    <input type="number" {...register('pollIntervalSec', { valueAsNumber: true })} className="input h-11 text-center font-bold" />
                    <span className="text-sm font-bold text-slate-400">SEC</span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic">{t('editor.pollIntervalHint')}</p>
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button 
                type="submit" 
                disabled={mutation.isPending || !isValid || !connectionTested}
                className={`btn-primary h-14 w-full text-lg shadow-xl gap-3 cursor-pointer ${(!isValid || !connectionTested) ? 'opacity-50 cursor-not-allowed shadow-none grayscale' : 'shadow-primary-200'}`}
              >
                {mutation.isPending ? (
                  <RefreshCcw size={20} className="animate-spin" />
                ) : (
                  <>
                    <Save size={20} fill="currentColor" />
                    {isNew ? t('editor.createMailbox') : t('editor.saveChanges')}
                  </>
                )}
              </button>
              <button 
                type="button" 
                onClick={() => navigate(-1)}
                className="btn-secondary h-12 w-full cursor-pointer"
              >
                {t('editor.discardChanges')}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

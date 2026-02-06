import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Search, Download as DownloadIcon, Filter, ExternalLink, Mail, User, Calendar, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

export default function Downloads() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { data: downloads, isLoading } = useQuery({
    queryKey: ['downloads', { q: search }],
    queryFn: () => api.downloads.list({ q: search }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <RefreshCcw className="animate-spin text-primary-500" size={32} />
        <p className="text-slate-500 font-medium">{t('common.loading')}</p>
      </div>
    </div>
  );

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{t('downloads.title')}</h1>
          <p className="text-slate-500 mt-2 text-lg">{t('downloads.subtitle')}</p>
        </div>

        <div className="relative group max-w-md w-full">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search size={20} className="text-slate-400 group-focus-within:text-primary-500 transition-colors" />
          </div>
          <input 
            type="text"
            placeholder={t('downloads.searchPlaceholder')}
            className="input pl-12 h-12 bg-white/50 focus:bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      <div className="card shadow-sm border-slate-200/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('downloads.fileDetails')}</th>
                <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('downloads.sourceMessage')}</th>
                <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('downloads.size')}</th>
                <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">{t('downloads.savedAt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {downloads?.map((download: any) => (
                <tr key={download.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center group-hover:bg-primary-600 group-hover:text-white transition-all">
                        <DownloadIcon size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 max-w-xs truncate" title={download.filename}>
                          {download.filename}
                        </div>
                        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter mt-0.5">{download.mime}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm text-slate-700 font-medium flex items-center gap-2">
                        <User size={14} className="text-slate-300" />
                        {download.from}
                      </div>
                      <div className="text-xs text-slate-400 truncate max-w-xs flex items-center gap-2 italic">
                        <Mail size={12} className="text-slate-300" />
                        {download.subject}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm text-slate-500 font-mono">
                    {(download.size / 1024).toFixed(1)} <span className="text-[10px] text-slate-300 font-sans font-bold">KB</span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex flex-col items-end">
                      <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        {format(new Date(download.downloadedAt), 'MMM d, yyyy')}
                        <Calendar size={14} className="text-slate-300" />
                      </div>
                      <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 mt-1 max-w-[150px] truncate" title={download.path}>
                        {download.path}
                      </code>
                    </div>
                  </td>
                </tr>
              ))}
              {downloads?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                        <DownloadIcon size={32} className="text-slate-200" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-900">{t('downloads.noDownloads')}</p>
                        <p className="text-sm font-medium">{t('downloads.noDownloadsSubtitle')}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

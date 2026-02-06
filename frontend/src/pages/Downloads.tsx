import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Search, Download as DownloadIcon, Filter, ExternalLink, Mail, User, Calendar, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatSize } from '../lib/format';

export default function Downloads() {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: downloads, isLoading, isFetching } = useQuery({
    queryKey: ['downloads', { q: search }],
    queryFn: () => api.downloads.list({ q: search }),
  });

  const showLoading = isLoading && !downloads;

  const toFriendlyType = (mime?: string) => {
    if (!mime) return 'Unknown';
    const [type, subtypeRaw] = mime.split('/');
    const s = (subtypeRaw || '').toLowerCase();
    if (s === 'pdf') return 'PDF';
    if (s === 'jpeg' || s === 'jpg') return 'JPEG';
    if (s === 'png') return 'PNG';
    if (s === 'gif') return 'GIF';
    if (s === 'svg+xml') return 'SVG';
    if (s === 'plain') return 'Text';
    if (s === 'html') return 'HTML';
    if (s === 'csv') return 'CSV';
    if (s.includes('zip')) return 'ZIP';
    if (s.includes('rar')) return 'RAR';
    if (s.includes('7z')) return '7‑Zip';
    if (s.includes('msword') || s.includes('wordprocessingml')) return 'Word';
    if (s.includes('vnd.ms-excel') || s.includes('spreadsheetml')) return 'Excel';
    if (s.includes('vnd.ms-powerpoint') || s.includes('presentationml')) return 'PowerPoint';
    if (s === 'json') return 'JSON';
    if (s === 'xml') return 'XML';
    if (s === 'octet-stream') return 'Binary';
    return s ? s.toUpperCase() : (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Unknown');
  };

  return (
    <div className="p-10 max-w-7xl mx-auto space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight dark:text-white">{t('downloads.title')}</h1>
          <p className="text-slate-500 mt-2 text-lg dark:text-slate-400">{t('downloads.subtitle')}</p>
        </div>

        <div className="relative group max-w-md w-full">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search size={20} className="text-slate-400 group-focus-within:text-primary-500 transition-colors dark:text-slate-500" />
          </div>
          <input 
            type="text"
            placeholder={t('downloads.searchPlaceholder')}
            className="input pl-12 h-12 bg-white/50 focus:bg-white dark:bg-slate-900/50 dark:focus:bg-slate-900"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {isFetching && (
            <div className="absolute right-4 inset-y-0 flex items-center">
              <RefreshCcw className="animate-spin text-primary-400" size={16} />
            </div>
          )}
        </div>
      </header>

      {showLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <RefreshCcw className="animate-spin text-primary-500" size={32} />
            <p className="text-slate-500 font-medium">{t('common.loading')}</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">{t('downloads.fileDetails')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">{t('downloads.sourceMessage')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">{t('downloads.size')}</th>
                  <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right dark:text-slate-500">{t('downloads.savedAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {downloads?.map((download: any) => (
                  <tr key={download.id} className="hover:bg-slate-50/50 transition-colors group dark:hover:bg-slate-800/30">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center group-hover:bg-primary-600 group-hover:text-white transition-all dark:bg-primary-950/30 dark:text-primary-400 dark:group-hover:bg-primary-500">
                          <DownloadIcon size={20} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900 max-w-xs truncate dark:text-white" title={download.filename}>
                            {download.filename}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter dark:text-slate-500">{toFriendlyType(download.mime)}</div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a 
                                href={api.downloads.getContentUrl(download.id)} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-[10px] font-bold text-primary-500 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                              >
                                {t('common.preview')}
                              </a>
                              <span className="text-[10px] text-slate-300 dark:text-slate-700">•</span>
                              <a 
                                href={api.downloads.getContentUrl(download.id)} 
                                download={download.filename}
                                className="text-[10px] font-bold text-primary-500 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                              >
                                {t('common.download')}
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm text-slate-700 font-medium flex items-center gap-2 dark:text-slate-300">
                          <User size={14} className="text-slate-300 dark:text-slate-600" />
                          {download.from}
                        </div>
                        <div className="text-xs text-slate-400 truncate max-w-xs flex items-center gap-2 italic dark:text-slate-500">
                          <Mail size={12} className="text-slate-300 dark:text-slate-600" />
                          {download.subject}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500 font-mono dark:text-slate-400">
                      {formatSize(download.size || 0)}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex flex-col items-end">
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-2 dark:text-white">
                          {format(new Date(download.downloadedAt), 'MMM d, yyyy')}
                          <Calendar size={14} className="text-slate-300 dark:text-slate-600" />
                        </div>
                        <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 mt-1 max-w-[150px] truncate dark:bg-slate-800 dark:text-slate-400" title={download.path}>
                          {download.path}
                        </code>
                      </div>
                    </td>
                  </tr>
                ))}
                {downloads?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center text-slate-400 dark:text-slate-500">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center dark:bg-slate-800">
                          <DownloadIcon size={32} className="text-slate-200 dark:text-slate-700" />
                        </div>
                        <div>
                          <p className="text-lg font-bold text-slate-900 dark:text-white">{t('downloads.noDownloads')}</p>
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
      )}
    </div>
  );
}

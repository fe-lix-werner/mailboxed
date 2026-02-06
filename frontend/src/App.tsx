import React from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail, LayoutDashboard, Download, Settings, LogOut, History, Languages, RefreshCcw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Dashboard from './pages/Dashboard'
import Mailboxes from './pages/Mailboxes'
import Downloads from './pages/Downloads'
import MailboxEditor from './pages/MailboxEditor'
import Login from './pages/Login'
import { useTranslation } from 'react-i18next'
import { api } from './api/client'

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: api.auth.me,
    retry: false,
  })

  const logoutMutation = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null)
      navigate('/login')
    }
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <RefreshCcw className="animate-spin text-primary-500" size={32} />
    </div>
  )

  if (isError || !user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('common.dashboard') },
    { to: '/mailboxes', icon: Settings, label: t('common.mailboxes') },
    { to: '/downloads', icon: Download, label: t('common.downloads') },
  ]

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'de' ? 'en' : 'de')
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
        <Link to="/" className="p-8 flex items-center gap-4">
          <div className="p-2.5 bg-primary-600 rounded-xl text-white shadow-lg shadow-primary-200 rotate-3">
            <Mail size={24} />
          </div>
          <span className="font-bold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-500">
            Mailboxed
          </span>
        </Link>
        
        <nav className="flex-1 px-4 py-6 space-y-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden ${
                  isActive 
                    ? 'bg-primary-50 text-primary-700 font-bold' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary-600 rounded-r-full" />
                )}
                <item.icon size={20} className={`transition-colors duration-300 ${isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        
        <div className="p-6 border-t border-slate-100 space-y-2">
          <button 
            onClick={toggleLanguage}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-500 hover:bg-slate-50 hover:text-primary-600 rounded-xl w-full transition-all duration-300 group"
          >
            <Languages size={20} className="text-slate-400 group-hover:text-primary-500 transition-colors" />
            <span className="font-semibold">{i18n.language.startsWith('de') ? 'English' : 'Deutsch'}</span>
          </button>
          <button 
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl w-full transition-all duration-300 group"
          >
            <LogOut size={20} className="text-slate-400 group-hover:text-red-500 transition-colors" />
            <span className="font-semibold">{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50/50 relative">
        <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-primary-50/50 to-transparent pointer-events-none" />
        <div className="relative">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/mailboxes" element={<Mailboxes />} />
            <Route path="/mailboxes/new" element={<MailboxEditor />} />
            <Route path="/mailboxes/:id" element={<MailboxEditor />} />
            <Route path="/downloads" element={<Downloads />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

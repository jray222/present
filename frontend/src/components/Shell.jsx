import React from 'react';
import { Gift, Users, Sparkles, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useLocation, onLinkClick } from '../lib/router';

const TABS = [
  { to: '/lists', label: 'Wishlists', Icon: Gift, match: (p) => p === '/' || p.startsWith('/lists') },
  { to: '/family', label: 'Family', Icon: Users, match: (p) => p.startsWith('/family') },
  { to: '/santa', label: 'Secret Santa', Icon: Sparkles, match: (p) => p.startsWith('/santa') },
  { to: '/settings', label: 'Settings', Icon: Settings, match: (p) => p.startsWith('/settings') },
];

function NavLink({ to, label, Icon, active }) {
  return (
    <a
      href={to}
      onClick={onLinkClick(to)}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 font-bold transition ${
        active
          ? 'bg-tomato-600 text-white shadow-pop'
          : 'text-muted hover:bg-sunk hover:text-ink'
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span>{label}</span>
    </a>
  );
}

export default function Shell({ children }) {
  const { path } = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-cream flex flex-col lg:flex-row">
      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 inset-x-0 bg-surface/95 backdrop-blur-md border-b border-line/80 px-4 py-2.5 z-30 flex items-center justify-between">
        <a href="/lists" onClick={onLinkClick('/lists')} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-tomato-600 text-white shadow-soft flex items-center justify-center text-base font-bold">
            🎁
          </div>
          <span className="font-display font-extrabold text-lg text-ink tracking-tight flex items-center gap-1">
            Present <span className="text-pine-600 text-xs">❄</span>
          </span>
        </a>

        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted truncate max-w-[110px]">
              @{user.username}
            </span>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="btn-soft text-xs py-1.5 px-2.5 flex items-center gap-1 text-tomato-600 font-bold hover:bg-tomato-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-surface border-r border-line/70 p-5 z-30">
        <a href="/lists" onClick={onLinkClick('/lists')} className="flex items-center gap-3 px-2 py-2 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-tomato-600 text-white shadow-pop flex items-center justify-center text-xl font-bold">
            🎁
          </div>
          <div>
            <span className="font-display font-extrabold text-2xl text-ink tracking-tight flex items-center gap-1.5">
              Present <span className="text-pine-600 text-sm">❄</span>
            </span>
          </div>
        </a>

        <nav className="space-y-1.5 flex-1">
          {TABS.map((tab) => (
            <NavLink key={tab.to} {...tab} active={tab.match(path)} />
          ))}
        </nav>

        {/* User profile dock */}
        <div className="pt-4 border-t border-line/70 flex items-center gap-3 bg-sunk rounded-2xl p-3">
          <div className="w-10 h-10 rounded-full bg-pine-700 text-white font-display font-extrabold flex items-center justify-center uppercase">
            {user?.full_name?.[0] || user?.username?.[0] || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate text-sm">{user?.full_name || user?.username}</p>
            <p className="text-xs text-muted truncate">@{user?.username}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="btn-icon text-muted hover:text-tomato-600 hover:bg-surface"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 lg:pl-64 pb-24 lg:pb-10 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-md border-t border-line/80 px-2 py-2 z-40 flex justify-around">
        {TABS.map((tab) => {
          const active = tab.match(path);
          const Icon = tab.Icon;
          return (
            <a
              key={tab.to}
              href={tab.to}
              onClick={onLinkClick(tab.to)}
              className={`flex flex-col items-center justify-center w-16 py-1.5 rounded-2xl transition ${
                active ? 'text-tomato-600 font-extrabold' : 'text-muted font-semibold hover:text-ink'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[11px] leading-tight">{tab.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

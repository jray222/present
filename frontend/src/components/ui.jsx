import React from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export function Spinner({ className = 'w-6 h-6 text-tomato-600' }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function ErrorBanner({ error, className = '' }) {
  if (!error) return null;
  const msg = typeof error === 'string' ? error : error?.response?.data?.detail || error?.message || 'An error occurred';
  return (
    <div className={`banner-error ${className}`} role="alert">
      <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{msg}</span>
    </div>
  );
}

export function SuccessBanner({ message, className = '' }) {
  if (!message) return null;
  return (
    <div className={`banner-ok ${className}`} role="status">
      <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{message}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-12 h-12 rounded-2xl bg-tomato-100 text-tomato-600 dark:bg-tomato-900/40 dark:text-tomato-200 flex items-center justify-center shrink-0">
            <Icon className="w-6 h-6" />
          </div>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl text-ink leading-tight flex items-center gap-2">
            {title}
            {/* Minimal subtle snowflake accent */}
            <span className="text-pine-600 dark:text-pine-400 text-lg opacity-80" title="Holiday Season">❄</span>
          </h1>
          {subtitle && <p className="text-sm text-muted font-medium mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

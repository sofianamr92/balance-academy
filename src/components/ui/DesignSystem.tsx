import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastMessage } from '../../contexts/AppContext';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'navy' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer';
  const sizes = {
    sm: 'text-xs px-3 py-1.5 min-h-[36px]',
    md: 'text-sm px-4 py-2 min-h-[40px]',
    lg: 'text-sm px-6 py-3 min-h-[44px]',
  };
  const variants = {
    primary: 'bg-[#3B82F6] text-white hover:bg-[#2563EB]',
    navy: 'bg-[#172554] text-white hover:bg-[#1E3A8A]',
    secondary: 'bg-white text-[#111827] border border-[#E2E8F0] hover:bg-[#F8FAFC]',
    ghost: 'bg-transparent text-[#64748B] hover:text-[#111827] hover:bg-[#F1F5F9]',
    danger: 'bg-[#DC2626] text-white hover:bg-[#B91C1C]',
  };

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function InputField({
  label,
  error,
  id,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  const inputId = id || `field-${label.replaceAll(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-[#111827]">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 min-h-[42px] ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
    </div>
  );
}

export function StatusText({
  tone,
  label,
  icon,
}: {
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  label: string;
  icon?: React.ReactNode;
}) {
  const tones = {
    success: 'text-[#16A34A] bg-[#16A34A]/8 border-[#16A34A]/20',
    warning: 'text-[#B45309] bg-[#F59E0B]/10 border-[#F59E0B]/25',
    danger: 'text-[#DC2626] bg-[#DC2626]/8 border-[#DC2626]/20',
    info: 'text-[#2563EB] bg-[#3B82F6]/8 border-[#3B82F6]/20',
    neutral: 'text-[#64748B] bg-[#F1F5F9] border-[#E2E8F0]',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <p className="text-xs font-medium text-[#64748B]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#172554] tabular-nums">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-[#64748B]">{sublabel}</p>}
    </div>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="w-full h-2 rounded-full bg-[#E2E8F0] overflow-hidden" role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-full bg-[#3B82F6] transition-all duration-300"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
      <p className="mt-2 mx-auto max-w-md text-sm text-[#64748B]">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B12]/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
          <h3 className="text-base font-semibold text-[#172554]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#111827]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
      {toasts.map((toast) => {
        const icon =
          toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0" />
          ) : (
            <Info className="h-4 w-4 text-[#3B82F6] shrink-0" />
          );
        return (
          <div
            key={toast.id}
            role="status"
            className="flex items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm text-sm text-[#111827]"
          >
            <div className="flex items-center gap-2.5">
              {icon}
              <span>{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="text-[#64748B] hover:text-[#111827]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

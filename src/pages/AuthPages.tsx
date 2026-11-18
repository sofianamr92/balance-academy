import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Button, InputField } from '../components/ui/DesignSystem';

export function AuthPages({
  mode,
  navigate,
}: {
  mode: 'login' | 'register' | 'forgot' | 'verify';
  navigate: (path: string) => void;
}) {
  const { t, locale, refreshUser, loginWithGoogle, pushToast } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [verifyCompleted, setVerifyCompleted] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [previewTokenInfo, setPreviewTokenInfo] = useState<{ token: string; url?: string } | null>(null);
  const [emailSentNotice, setEmailSentNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitVerifyToken = React.useCallback(
    async (rawToken: string) => {
      const cleaned = rawToken.trim();
      if (!cleaned) return;
      setSubmitting(true);
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: cleaned }),
        });
        const data = await res.json();
        if (!res.ok) {
          pushToast('error', data.error || 'Verification failed');
          return;
        }
        setVerifyCompleted(true);
        await refreshUser();
        pushToast('success', t.auth.emailVerifiedSuccess);
      } finally {
        setSubmitting(false);
      }
    },
    [pushToast, refreshUser, t.auth.emailVerifiedSuccess],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token')?.trim();
    if (mode === 'forgot' && urlToken) {
      setResetToken(urlToken);
      setForgotStep('reset');
    } else if (mode === 'verify' && urlToken) {
      setVerifyToken(urlToken);
      void submitVerifyToken(urlToken);
    }
  }, [mode, submitVerifyToken]);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      const signedInUser = await loginWithGoogle();
      if (signedInUser) {
        navigate(signedInUser.role === 'student' ? '/student' : '/admin');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      pushToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Login failed');
        return;
      }
      await refreshUser();
      navigate(data.user.role === 'student' ? '/student' : '/admin');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      pushToast('error', t.auth.passwordMismatch);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
          preferredLanguage: locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Registration failed');
        return;
      }
      await refreshUser();
      if (data.emailDeliveryMode === 'email_sent') {
        pushToast('success', t.auth.checkInboxAfterRegister);
      }
      navigate(data.user?.role === 'student' ? '/student' : '/admin');
    } catch {
      pushToast('error', locale === 'ar' ? 'تعذر إتمام التسجيل، حاول مرة أخرى' : 'Could not complete registration');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setEmailSentNotice(false);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Request failed');
        return;
      }
      if (data.resetToken) {
        setPreviewTokenInfo({ token: data.resetToken, url: data.resetUrl });
        setResetToken(data.resetToken);
        setForgotStep('reset');
        pushToast('success', t.auth.previewRecoveryNote);
      } else {
        setPreviewTokenInfo(null);
        setEmailSentNotice(true);
        pushToast('success', t.auth.emailSentNotice);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      pushToast('error', t.auth.passwordMismatch);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Reset failed');
        return;
      }
      setResetToken('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPreviewTokenInfo(null);
      setForgotStep('request');
      pushToast('success', t.auth.resetSuccessLogin);
      navigate('/login');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  const googleButton = (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-colors cursor-pointer disabled:opacity-60"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
          />
        </svg>
        <span>{t.auth.googleSignIn}</span>
      </button>

      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-[#E2E8F0]" />
        <span className="mx-3 shrink-0 text-[11px] font-medium text-[#64748B]">{t.auth.orDivider}</span>
        <div className="flex-grow border-t border-[#E2E8F0]" />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-[#172554]">
            {mode === 'login'
              ? t.auth.loginTitle
              : mode === 'register'
              ? t.auth.registerTitle
              : mode === 'verify'
              ? t.auth.verifyEmailTitle
              : t.auth.forgotTitle}
          </h1>
          <p className="text-xs text-[#64748B]">{t.brandAgency}</p>
        </div>

        {mode === 'login' && (
          <>
            {googleButton}
            <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
              <InputField
                label={t.auth.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <InputField
                label={t.auth.password}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-[#3B82F6] hover:underline cursor-pointer"
                >
                  {t.auth.forgotTitle}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="text-[#172554] font-medium hover:underline cursor-pointer"
                >
                  {t.auth.submitRegister}
                </button>
              </div>

              <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
                {t.auth.submitLogin}
              </Button>
            </form>

            {/* Demo Access Quick Fill */}
            <div className="border-t border-[#E2E8F0] pt-5 space-y-2.5">
              <p className="text-xs font-semibold text-[#64748B]">{t.auth.demoQuickAccess}</p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemo('student@balance.academy', 'BalanceStudent!2026')}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-start text-xs hover:border-[#3B82F6] cursor-pointer"
                >
                  <span className="font-semibold text-[#172554]">Student Demo:</span>{' '}
                  <span className="font-mono-num text-[#64748B]">student@balance.academy</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('content@balance.academy', 'BalanceEditor!2026')}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-start text-xs hover:border-[#3B82F6] cursor-pointer"
                >
                  <span className="font-semibold text-[#172554]">Content Manager Demo:</span>{' '}
                  <span className="font-mono-num text-[#64748B]">content@balance.academy</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('admin@balance.academy', 'BalanceAdmin!2026')}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-start text-xs hover:border-[#3B82F6] cursor-pointer"
                >
                  <span className="font-semibold text-[#172554]">Super Admin Demo:</span>{' '}
                  <span className="font-mono-num text-[#64748B]">admin@balance.academy</span>
                </button>
              </div>
            </div>
          </>
        )}

        {mode === 'register' && (
          <>
            {googleButton}
            <form onSubmit={(e) => void handleRegister(e)} className="space-y-4">
              <InputField
                label={t.auth.fullName}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <InputField
                label={t.auth.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <InputField
                label={t.auth.phone}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <InputField
                label={t.auth.password}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <InputField
                label={t.auth.confirmRegisterPassword}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
              <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
                {t.auth.submitRegister}
              </Button>
              <p className="text-center text-xs text-[#64748B]">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-[#3B82F6] hover:underline cursor-pointer"
                >
                  {t.auth.loginTitle}
                </button>
              </p>
            </form>
          </>
        )}

        {mode === 'forgot' && (
          <div className="space-y-5">
            <p className="text-xs leading-relaxed text-[#475569]">{t.auth.forgotSubtitle}</p>

            {forgotStep === 'request' && (
              <form onSubmit={(e) => void handleForgot(e)} className="space-y-4">
                <InputField
                  label={t.auth.email}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
                  {t.auth.submitForgot}
                </Button>

                {emailSentNotice && (
                  <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-xs text-[#1E40AF]">
                    {t.auth.emailSentNotice}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setForgotStep('reset')}
                    className="text-[#3B82F6] hover:underline cursor-pointer"
                  >
                    {t.auth.haveTokenToggle}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-[#172554] font-medium hover:underline cursor-pointer"
                  >
                    {t.nav.login}
                  </button>
                </div>
              </form>
            )}

            {forgotStep === 'reset' && (
              <form onSubmit={(e) => void handleReset(e)} className="space-y-4">
                {previewTokenInfo && (
                  <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3.5 space-y-1.5">
                    <p className="text-xs font-semibold text-[#172554]">{t.auth.previewRecoveryTitle}</p>
                    <p className="text-[11px] text-[#334155]">{t.auth.previewRecoveryNote}</p>
                    <p className="font-mono-num text-[11px] bg-white border border-[#DBEAFE] rounded px-2.5 py-1.5 text-[#1E3A8A] break-all select-all">
                      {previewTokenInfo.token}
                    </p>
                  </div>
                )}

                <InputField
                  label={t.auth.resetTokenLabel}
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                />
                <InputField
                  label={t.auth.newPassword}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <InputField
                  label={t.auth.confirmPassword}
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  minLength={8}
                  required
                />

                <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
                  {t.auth.confirmResetBtn}
                </Button>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setForgotStep('request')}
                    className="text-[#3B82F6] hover:underline cursor-pointer"
                  >
                    {t.auth.backToEmailStep}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-[#172554] font-medium hover:underline cursor-pointer"
                  >
                    {t.nav.login}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {mode === 'verify' && (
          <div className="space-y-5">
            {verifyCompleted ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-xs sm:text-sm text-[#166534] font-medium">
                  {t.auth.emailVerifiedSuccess}
                </div>
                <Button
                  type="button"
                  variant="navy"
                  className="w-full"
                  onClick={() => navigate('/student')}
                >
                  {t.nav.dashboard}
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitVerifyToken(verifyToken);
                }}
                className="space-y-4"
              >
                <p className="text-xs leading-relaxed text-[#475569]">{t.auth.verifyEmailSubtitle}</p>
                <InputField
                  label={t.auth.verifyTokenLabel}
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
                  {t.auth.verifyNowBtn}
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

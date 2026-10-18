import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './AuthPage.css';

export default function AuthPage() {
  const { t, login, lang, theme, updatePreference } = useApp();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Password Visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // States
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [successToast, setSuccessToast] = useState('');

  // Tab switching
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setApiError('');
    setValidationErrors({});
    setPassword('');
    setConfirmPassword('');
  };

  // Inline validations
  const validateForm = () => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (activeTab === 'register') {
      if (!name.trim()) {
        errors.name = lang === 'id' ? 'Nama lengkap wajib diisi.' : 'Full name is required.';
      }
    }

    if (!email.trim()) {
      errors.email = lang === 'id' ? 'Email wajib diisi.' : 'Email is required.';
    } else if (!emailRegex.test(email)) {
      errors.email = lang === 'id' ? 'Format email tidak valid.' : 'Invalid email format.';
    }

    if (!password) {
      errors.password = lang === 'id' ? 'Kata sandi wajib diisi.' : 'Password is required.';
    } else if (password.length < 6) {
      errors.password = lang === 'id' ? 'Kata sandi minimal 6 karakter.' : 'Password must be at least 6 characters.';
    }

    if (activeTab === 'register') {
      if (!confirmPassword) {
        errors.confirmPassword = lang === 'id' ? 'Ulangi kata sandi wajib diisi.' : 'Please confirm your password.';
      } else if (password !== confirmPassword) {
        errors.confirmPassword = t('auth.error.passwordMismatch');
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setApiError('');

    if (!validateForm()) return;

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (activeTab === 'login') {
        const response = await api.post('/api/auth/login', { email: cleanEmail, password });
        const data = await response.json().catch(() => ({}));
        
        if (!response.ok) {
          if (response.status === 401 || data.code === 'INVALID_CREDENTIALS') {
            setApiError(t('auth.error.invalidCredentials') || 'Email atau kata sandi salah.');
          } else if (response.status === 403 || data.error?.message?.includes('disabled')) {
            setApiError(lang === 'id' ? 'Akun Anda telah dinonaktifkan.' : 'Your account has been disabled.');
          } else {
            setApiError(data.error?.message || data.message || t('auth.error.generic'));
          }
          setLoading(false);
          return;
        }

        // Successfully logged in
        login(data.token, data.refreshToken, data.user);
      } else {
        const response = await api.post('/api/auth/register', { name: name.trim(), email: cleanEmail, password });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (response.status === 409 || data.code === 'EMAIL_TAKEN') {
            setApiError(t('auth.error.emailTaken') || 'Email sudah digunakan. Coba masuk.');
          } else {
            setApiError(data.error?.message || data.message || t('auth.error.generic'));
          }
          setLoading(false);
          return;
        }

        // Successfully registered
        setSuccessToast(lang === 'id' ? 'Akun berhasil dibuat' : 'Account successfully created');
        setTimeout(() => {
          login(data.token, data.refreshToken, data.user);
        }, 1500);
      }
    } catch (err) {
      setApiError(t('auth.error.generic'));
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      {/* Toast Notification */}
      {successToast && (
        <div className="auth-toast auth-toast--success" role="status" aria-live="polite">
          <svg className="auth-toast__icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="auth-toast__text">{successToast}</span>
        </div>
      )}

      <div className="auth-panel">
        {/* Left Decorative Panel (Desktop Only) */}
        <section className="auth-panel--left" aria-hidden="true">
          <div className="auth-panel__left-content">
            <header className="auth-logo">
              <span className="auth-logo__text">Docuflow</span>
            </header>
            <p className="auth-tagline">{t('auth.panel.tagline')}</p>
          </div>
        </section>

        {/* Right Form Panel */}
        <section className="auth-panel--right">
          <div className="auth-panel__right-container">
            {/* Small Logo for Mobile/Tablet */}
            <div className="auth-logo--mobile">
              <span className="auth-logo__text">Docuflow</span>
            </div>

            {/* Language & Theme Selectors */}
            <div className="auth-preferences">
              <button
                className="auth-pref-btn"
                onClick={() => updatePreference({ lang: lang === 'id' ? 'en' : 'id' })}
                aria-label="Switch Language"
              >
                {lang === 'id' ? 'EN' : 'ID'}
              </button>
              <button
                className="auth-pref-btn"
                onClick={() => updatePreference({ theme: theme === 'light' ? 'dark' : 'light' })}
                aria-label="Toggle Theme"
              >
                {theme === 'light' ? (
                  <svg className="auth-pref-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="auth-pref-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Header Text */}
            <header className="auth-header">
              <h2 className="auth-title">
                {activeTab === 'login' ? t('auth.login.title') : t('auth.register.title')}
              </h2>
              <p className="auth-subtitle">
                {activeTab === 'login' ? t('auth.login.subtitle') : t('auth.register.subtitle')}
              </p>
            </header>

            {/* Tab Toggles */}
            <div className="auth-tabs" role="tablist">
              <button
                role="tab"
                id="tab-login"
                aria-controls="panel-login"
                aria-selected={activeTab === 'login'}
                onClick={() => handleTabChange('login')}
                className={`auth-tab interactive ${activeTab === 'login' ? 'auth-tab--active' : ''}`}
              >
                {t('auth.tab.login')}
              </button>
              <button
                role="tab"
                id="tab-register"
                aria-controls="panel-register"
                aria-selected={activeTab === 'register'}
                onClick={() => handleTabChange('register')}
                className={`auth-tab interactive ${activeTab === 'register' ? 'auth-tab--active' : ''}`}
              >
                {t('auth.tab.register')}
              </button>
            </div>

            {/* API Error Banner */}
            {apiError && (
              <div className="auth-error-banner" role="alert">
                <span className="auth-error-banner__text">{apiError}</span>
              </div>
            )}

            {/* Forms Container */}
            <div
              role="tabpanel"
              id={`panel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              className="auth-form-container"
            >
              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {/* Name field (Register only) */}
                {activeTab === 'register' && (
                  <div className="auth-field">
                    <label htmlFor="reg-name" className="auth-label">
                      {t('auth.field.name')}
                    </label>
                    <input
                      type="text"
                      id="reg-name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`auth-input interactive ${validationErrors.name ? 'auth-input--error' : ''}`}
                      aria-describedby={validationErrors.name ? 'err-name' : undefined}
                    />
                    {validationErrors.name && (
                      <span id="err-name" className="auth-field-error">
                        {validationErrors.name}
                      </span>
                    )}
                  </div>
                )}

                {/* Email field */}
                <div className="auth-field">
                  <label htmlFor="auth-email" className="auth-label">
                    {t('auth.field.email')}
                  </label>
                  <input
                    type="email"
                    id="auth-email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`auth-input interactive ${validationErrors.email ? 'auth-input--error' : ''}`}
                    aria-describedby={validationErrors.email ? 'err-email' : undefined}
                  />
                  {validationErrors.email && (
                    <span id="err-email" className="auth-field-error">
                      {validationErrors.email}
                    </span>
                  )}
                </div>

                {/* Password field */}
                <div className="auth-field">
                  <div className="auth-label-row">
                    <label htmlFor="auth-password" className="auth-label">
                      {activeTab === 'login' ? t('auth.field.password') : t('auth.field.newPassword')}
                    </label>
                    {activeTab === 'login' && (
                      <a href="#forgot" className="auth-link interactive" onClick={(e) => { e.preventDefault(); alert('Forgot password clicked'); }}>
                        {t('auth.forgot')}
                      </a>
                    )}
                  </div>
                  <div className="auth-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="auth-password"
                      autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`auth-input interactive ${validationErrors.password ? 'auth-input--error' : ''}`}
                      style={{ paddingRight: '44px' }}
                      aria-describedby={validationErrors.password ? 'err-password' : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="auth-password-toggle interactive"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="auth-toggle-icon">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="auth-toggle-icon">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <span id="err-password" className="auth-field-error">
                      {validationErrors.password}
                    </span>
                  )}
                </div>

                {/* Confirm Password field (Register only) */}
                {activeTab === 'register' && (
                  <div className="auth-field">
                    <label htmlFor="auth-confirm-password" className="auth-label">
                      {t('auth.field.confirmPassword')}
                    </label>
                    <div className="auth-input-wrapper">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="auth-confirm-password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`auth-input interactive ${validationErrors.confirmPassword ? 'auth-input--error' : ''}`}
                        style={{ paddingRight: '44px' }}
                        aria-describedby={validationErrors.confirmPassword ? 'err-confirm' : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="auth-password-toggle interactive"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? (
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="auth-toggle-icon">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                          </svg>
                        ) : (
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="auth-toggle-icon">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {validationErrors.confirmPassword && (
                      <span id="err-confirm" className="auth-field-error">
                        {validationErrors.confirmPassword}
                      </span>
                    )}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-submit-btn btn btn-primary interactive"
                >
                  {loading
                    ? t('auth.btn.loading')
                    : activeTab === 'login'
                    ? t('auth.btn.login')
                    : t('auth.btn.register')}
                </button>
              </form>
            </div>

            {/* Footer Text */}
            <footer className="auth-footer">
              <span className="auth-footer__text">
                {activeTab === 'login' ? t('auth.switch.toRegister') : t('auth.switch.toLogin')}{' '}
                <button
                  onClick={() => handleTabChange(activeTab === 'login' ? 'register' : 'login')}
                  className="auth-footer__link-btn interactive"
                >
                  {activeTab === 'login' ? t('auth.switch.toRegisterLink') : t('auth.switch.toLoginLink')}
                </button>
              </span>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

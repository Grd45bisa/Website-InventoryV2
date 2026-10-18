import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, Lock, KeyRound, Eye, EyeOff, Globe, Moon, Sun, Save, Check, AlertCircle, X, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './ProfileSetting.css';

export default function ProfileSetting() {
  const { user, lang, theme, palette, darkness, t, updatePreference, updateUser } = useApp();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'super_admin';
  const canChangePalette = isSuperAdmin || user?.role === 'owner';

  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setName(user?.fullName || '');
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = { fullName: name };

      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error('password_mismatch');
        }
        if (newPassword.length < 6) {
          throw new Error('password_too_short');
        }
        payload.password = newPassword;
      }

      const res = await api.patch('/api/auth/profile', payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed');
      }

      const data = await res.json().catch(() => ({}));
      if (data.user) {
        updateUser(data.user);
      }

      if (newPassword) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }

      setMessage({ type: 'success', text: t('settings.profile.saveSuccess') });
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
    } catch (err) {
      if (err.message === 'password_mismatch') {
        setMessage({ type: 'error', text: t('settings.profile.error.passwordMismatch') });
      } else if (err.message === 'password_too_short') {
        setMessage({ type: 'error', text: t('settings.profile.error.passwordTooShort') });
      } else {
        setMessage({ type: 'error', text: err.message || t('settings.error.save') });
      }
    } finally {
      setSaving(false);
    }
  };

  const initials = (user?.fullName || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <form className="settings-form settings-profile-form" onSubmit={handleSave}>
      {/* Header */}
      <div className="profile-header">
        <div className="profile-header__avatar">{initials}</div>
        <div className="profile-header__text">
          <h2 className="profile-header__title">{t('settings.profile.title')}</h2>
          <p className="profile-header__subtitle">{t('settings.profile.subtitle')}</p>
        </div>
      </div>

      {/* Account info */}
      <section className="settings-card">
        <div className="settings-card__header">
          <User size={16} />
          <h3>{t('settings.profile.name')}</h3>
        </div>
        <div className="settings-form__row">
          <div className="settings-form__group">
            <label className="settings-form__label">{t('settings.profile.name')}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="settings-form__group">
            <label className="settings-form__label">{t('settings.profile.email')}</label>
            <div className="input-with-icon">
              <input className="input input--disabled" value={user?.email || ''} disabled />
              <Lock size={16} className="input-icon input-icon--right" />
            </div>
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="settings-card">
        <div className="settings-card__header">
          <KeyRound size={16} />
          <h3>{t('settings.profile.password')}</h3>
        </div>
        <p className="settings-form__hint">{t('settings.profile.password.desc')}</p>

        <div className="settings-form__row">
          <div className="settings-form__group">
            <label className="settings-form__label">{t('settings.profile.currentPassword')}</label>
            <div className="input-with-icon">
              <input
                className="input"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Masukkan kata sandi saat ini"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                aria-label="Toggle password visibility"
              >
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="settings-form__group">
            <label className="settings-form__label">{t('settings.profile.newPassword')}</label>
            <div className="input-with-icon">
              <input
                className="input"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Masukkan kata sandi baru"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label="Toggle password visibility"
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-form__group">
          <label className="settings-form__label">{t('settings.profile.password.confirm')}</label>
          <div className="input-with-icon">
            <input
              className="input"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Konfirmasi kata sandi baru"
            />
            <button
              type="button"
              className="input-icon-btn"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label="Toggle password visibility"
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="settings-card">
        <div className="settings-card__header">
          <Globe size={16} />
          <h3>{t('settings.profile.language')}</h3>
        </div>
        <div className="settings-form__row">
          <div className="settings-form__group">
            <label className="settings-form__label">{t('settings.profile.language')}</label>
            <p className="settings-form__hint">{t('settings.profile.language.desc')}</p>
            <div className="select-with-icon">
              <Globe size={16} className="select-icon" />
              <select
                className="input select-input"
                value={lang}
                onChange={(e) => updatePreference({ lang: e.target.value })}
              >
                <option value="id">{t('settings.profile.lang.id')}</option>
                <option value="en">{t('settings.profile.lang.en')}</option>
              </select>
            </div>
          </div>

          <div className="settings-form__group">
            <label className="settings-form__label">{t('settings.profile.theme')}</label>
            <p className="settings-form__hint">{t('settings.profile.theme.desc')}</p>
            <div className="theme-switch" role="group" aria-label="Theme">
              <button
                type="button"
                className={`theme-switch__option ${theme === 'light' ? 'is-active' : ''}`}
                onClick={() => updatePreference({ theme: 'light' })}
              >
                <Sun size={15} />
                <span>{t('settings.profile.theme.light') || 'Terang'}</span>
              </button>
              <button
                type="button"
                className={`theme-switch__option ${theme === 'dark' ? 'is-active' : ''}`}
                onClick={() => updatePreference({ theme: 'dark' })}
              >
                <Moon size={15} />
                <span>{t('settings.profile.theme.dark') || 'Gelap'}</span>
              </button>
            </div>
          </div>

          <div className="settings-form__group">
            <label className="settings-form__label">{t('settings.profile.palette')}</label>
            {canChangePalette ? (
              <p className="settings-form__hint">{t('settings.profile.palette.desc')}</p>
            ) : (
              <p className="settings-form__hint settings-form__hint--info">
                <Info size={12} />
                <span>{t('settings.profile.palette.adminHint')}</span>
              </p>
            )}
            <div className={`palette-selector ${!canChangePalette ? 'palette-selector--readonly' : ''}`} role="group" aria-label="Accent Color">
              {['indigo', 'emerald', 'rose', 'amber', 'sky', 'violet'].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`palette-swatch palette-swatch--${p} ${palette === p ? 'is-active' : ''}`}
                  onClick={() => canChangePalette && updatePreference({ palette: p })}
                  title={t(`settings.profile.palette.${p}`)}
                  tabIndex={canChangePalette ? 0 : -1}
                  aria-disabled={!canChangePalette}
                >
                  <span className="palette-swatch__dot" />
                </button>
              ))}
            </div>
          </div>

          <div className="settings-form__group" style={theme !== 'dark' ? { display: 'none' } : {}}>
            <label className="settings-form__label">{t('settings.profile.darkness')}</label>
            <p className="settings-form__hint">{t('settings.profile.darkness.desc')}</p>
            <div className="theme-switch" role="group" aria-label="Darkness Level">
              {['soft', 'dark', 'deep'].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`theme-switch__option ${darkness === d ? 'is-active' : ''}`}
                  onClick={() => updatePreference({ darkness: d })}
                >
                  <span>{t(`settings.profile.darkness.${d}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="profile-footer">
        {message && (
          <div className="profile-footer__message">
            <div className={`settings-message settings-message--${message.type}`}>
              <span className="settings-message__icon">
                {message.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
              </span>
              <span className="settings-message__text">{message.text}</span>
              <button type="button" className="settings-message__close" onClick={() => setMessage(null)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        <button className="btn btn-primary btn-save" type="submit" disabled={saving}>
          <Save size={16} className="btn-save__icon" />
          <span>{saving ? t('settings.saving') : t('settings.save')}</span>
        </button>
      </div>
    </form>
  );
}
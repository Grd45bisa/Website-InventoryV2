import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Search, RotateCcw, Hash, Copy, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api, getWorkspaceSettings, DEFAULT_RULES, buildDocumentNumber } from '../../utils/api.js';
import './DocumentNumberingSetting.css';

const TOKENS = ['{PREFIX}', '{YYYY}', '{YY}', '{MM}', '{DD}', '{SEQ}', '{BRANCH}', '{WAREHOUSE}'];

export default function DocumentNumberingSetting() {
  const { t } = useApp();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: getWorkspaceSettings,
    staleTime: 5 * 60 * 1000,
  });

  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRule, setSelectedRule] = useState(null);
  const [builderPrefix, setBuilderPrefix] = useState('');
  const [builderFormat, setBuilderFormat] = useState('');
  const [builderSeqLen, setBuilderSeqLen] = useState(4);
  const [builderSeparator, setBuilderSeparator] = useState('/');
  const [builderLeadingZero, setBuilderLeadingZero] = useState(true);
  const [builderReset, setBuilderReset] = useState('monthly');

  useEffect(() => {
    const savedRules = settings?.numbering?.rules || (Array.isArray(settings?.numbering) ? settings.numbering : null);
    if (Array.isArray(savedRules) && savedRules.length > 0) {
      const merged = [...savedRules];
      DEFAULT_RULES.forEach((defRule) => {
        if (!merged.some((r) => r.type === defRule.type)) {
          merged.push(defRule);
        }
      });
      setRules(merged);
      setSelectedRule(merged[0]);
      applyRuleToBuilder(merged[0]);
    } else {
      setRules(DEFAULT_RULES);
      setSelectedRule(DEFAULT_RULES[0]);
      applyRuleToBuilder(DEFAULT_RULES[0]);
    }
    setLoadingRules(false);
  }, [settings]);

  function applyRuleToBuilder(rule) {
    setBuilderPrefix(rule.prefix || '');
    setBuilderFormat(rule.format || '');
    setBuilderSeqLen(rule.seqLength ?? 4);
    setBuilderSeparator(rule.separator ?? '/');
    setBuilderLeadingZero(rule.leadingZero !== false);
    setBuilderReset(rule.seqReset || 'monthly');
  }

  const filtered = useMemo(() =>
    rules.filter((r) => r.type.toLowerCase().includes(search.toLowerCase())),
    [rules, search]
  );

  const builderExample = useMemo(() => {
    if (!selectedRule) return '';
    const builderRule = {
      ...selectedRule,
      prefix: builderPrefix,
      format: builderFormat,
      seqLength: builderSeqLen,
      separator: builderSeparator,
      leadingZero: builderLeadingZero,
      seqReset: builderReset,
    };

    return buildDocumentNumber(selectedRule.type, '2026-06-30', 0, { numbering: [builderRule] });
  }, [selectedRule, builderPrefix, builderFormat, builderSeqLen, builderSeparator, builderLeadingZero, builderReset]);

  const syncBuilderToRule = useCallback(() => {
    if (!selectedRule) return;
    const updated = { ...selectedRule, prefix: builderPrefix, format: builderFormat, seqLength: builderSeqLen, separator: builderSeparator, leadingZero: builderLeadingZero, seqReset: builderReset };
    setRules((prev) => prev.map((r) => r.type === selectedRule.type ? updated : r));
    setSelectedRule(updated);
  }, [selectedRule, builderPrefix, builderFormat, builderSeqLen, builderSeparator, builderLeadingZero, builderReset]);

  useEffect(() => { syncBuilderToRule(); }, [builderPrefix, builderFormat, builderSeqLen, builderSeparator, builderLeadingZero, builderReset]);

  const handleSelectRule = (rule) => {
    setSelectedRule(rule);
    applyRuleToBuilder(rule);
  };

  const handleResetDefault = async () => {
    setRules(DEFAULT_RULES);
    setSelectedRule(DEFAULT_RULES[0]);
    applyRuleToBuilder(DEFAULT_RULES[0]);
    handleSave(DEFAULT_RULES);
  };

  const handleSave = async (overrideRules) => {
    setSaving(true);
    try {
      const payload = overrideRules || rules;
      const res = await api.patch('/api/workspace/settings/numbering', { value: { rules: payload } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed');
      }
      queryClient.invalidateQueries({ queryKey: ['workspace-settings'] });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loadingRules) return null;

  return (
    <div className="numbering-page settings-form">
      <div className="settings-form__header-row">
        <div>
          <h2 className="settings-form__title">{t('settings.numbering.title')}</h2>
          <p className="settings-form__desc">{t('settings.numbering.subtitle')}</p>
        </div>
        <button className="btn btn-primary btn-save" type="button" disabled={saving} onClick={() => handleSave()}>
          <Save size={16} />
          <span>{saving ? t('settings.saving') : t('settings.save')}</span>
        </button>
      </div>

      <div className="numbering-toolbar">
        <div className="numbering-toolbar__search">
          <Search size={16} className="numbering-toolbar__search-icon" />
          <input
            className="input numbering-toolbar__search-input"
            placeholder={t('settings.numbering.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="numbering-toolbar__actions">
          <button className="btn btn-secondary btn-md" type="button" onClick={handleResetDefault}>
            <RotateCcw size={16} />
            {t('settings.numbering.resetDefault')}
          </button>
        </div>
      </div>

      <div className="numbering-layout">
        <div className="numbering-table-container">
          <div className="numbering-table-wrap">
            <table className="numbering-table">
              <thead>
                <tr>
                  <th>{t('settings.numbering.column.type')}</th>
                  <th>{t('settings.numbering.column.prefix')}</th>
                  <th>{t('settings.numbering.column.example')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rule) => (
                  <tr
                    key={rule.type}
                    className={`numbering-row ${selectedRule?.type === rule.type ? 'numbering-row--active' : ''}`}
                    onClick={() => handleSelectRule(rule)}
                  >
                    <td>
                      <span className="numbering-row__type-label">
                        {t(`settings.numbering.docType.${rule.type}`)}
                      </span>
                    </td>
                    <td>
                      <code className="numbering-row__code">{rule.prefix}</code>
                    </td>
                    <td>
                      <span className="numbering-row__example">
                        {buildDocumentNumber(rule.type, '2026-06-30', 0, { numbering: rules })}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr className="numbering-row--empty">
                    <td colSpan={3}>
                      <div className="settings-users-empty">
                        <AlertCircle size={24} className="settings-users-empty__icon" />
                        <p className="settings-users-empty__text">{t('settings.numbering.empty')}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Helpful Hint on Tokens */}
          <div className="numbering-help">
            <h4 className="numbering-help__title">{t('settings.numbering.tokenGuide')}</h4>
            <div className="numbering-help__body">
              <div className="numbering-help__tokens">
                <span><code>{'{PREFIX}'}</code> : {t('settings.numbering.tokenPrefix')}</span>
                <span><code>{'{YYYY}'}</code> : {t('settings.numbering.tokenYearFull')}</span>
                <span><code>{'{YY}'}</code> : {t('settings.numbering.tokenYearShort')}</span>
                <span><code>{'{MM}'}</code> : {t('settings.numbering.tokenMonth')}</span>
              </div>
              <div className="numbering-help__tokens">
                <span><code>{'{DD}'}</code> : {t('settings.numbering.tokenDay')}</span>
                <span><code>{'{SEQ}'}</code> : {t('settings.numbering.tokenSeq')}</span>
                <span><code>{'{BRANCH}'}</code> : {t('settings.numbering.tokenBranch')}</span>
                <span><code>{'{WAREHOUSE}'}</code> : {t('settings.numbering.tokenWarehouse')}</span>
              </div>
            </div>
          </div>
        </div>

        {selectedRule && (
          <div className="numbering-builder">
            <h3 className="numbering-builder__title">{t('settings.numbering.formatBuilder')} — {t(`settings.numbering.docType.${selectedRule.type}`)}</h3>

            <div className="settings-form__group">
              <label className="settings-form__label">{t('settings.numbering.column.prefix')}</label>
              <input
                className="input"
                value={builderPrefix}
                onChange={(e) => setBuilderPrefix(e.target.value)}
                placeholder={t('settings.numbering.prefixPlaceholder')}
              />
            </div>

            <div className="numbering-builder__tokens">
              {TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  className={`numbering-token ${builderFormat.includes(token) ? 'numbering-token--active' : ''}`}
                  onClick={() => {
                    if (!builderFormat.includes(token)) {
                      setBuilderFormat((prev) => prev + token);
                    }
                  }}
                >
                  {token}
                </button>
              ))}
            </div>

            <div className="numbering-builder__fields">
              <div className="settings-form__group">
                <label className="settings-form__label">{t('settings.numbering.column.format')}</label>
                <input
                  className="input"
                  value={builderFormat}
                  onChange={(e) => setBuilderFormat(e.target.value)}
                />
              </div>

              <div className="numbering-builder__preview">
                <span className="numbering-builder__preview-label">{t('settings.numbering.example')}:</span>
                <code className="numbering-builder__preview-code">{builderExample}</code>
              </div>
            </div>

            <div className="numbering-builder__subhead">
              <SlidersHorizontal size={13} />
              <span>{t('settings.numbering.advanced')}</span>
            </div>

            <div className="settings-form__row">
              <div className="settings-form__group">
                <label className="settings-form__label">{t('settings.numbering.separatorLabel')}</label>
                <select className="input" value={builderSeparator} onChange={(e) => setBuilderSeparator(e.target.value)}>
                  <option value="/">{t('settings.numbering.separator.slash')}</option>
                  <option value="-">{t('settings.numbering.separator.dash')}</option>
                  <option value=".">{t('settings.numbering.separator.dot')}</option>
                  <option value="_">{t('settings.numbering.separator.underscore')}</option>
                </select>
              </div>

              <div className="settings-form__group">
                <label className="settings-form__label">{t('settings.numbering.seqReset')}</label>
                <select className="input" value={builderReset} onChange={(e) => setBuilderReset(e.target.value)}>
                  <option value="monthly">{t('settings.numbering.monthly')}</option>
                  <option value="yearly">{t('settings.numbering.yearly')}</option>
                  <option value="never">{t('settings.numbering.never')}</option>
                </select>
              </div>
            </div>

            <div className="settings-form__row">
              <div className="settings-form__group">
                <label className="settings-form__label">{t('settings.numbering.seqLengthLabel')}</label>
                <select className="input" value={builderSeqLen} onChange={(e) => setBuilderSeqLen(Number(e.target.value))}>
                  <option value={3}>{t('settings.numbering.seqLength.3')}</option>
                  <option value={4}>{t('settings.numbering.seqLength.4')}</option>
                  <option value={5}>{t('settings.numbering.seqLength.5')}</option>
                  <option value={6}>{t('settings.numbering.seqLength.6')}</option>
                </select>
              </div>

              <div className="settings-form__group numbering-builder__checkbox-group">
                <label className="modules-toolbar__toggle">
                  <input
                    type="checkbox"
                    checked={builderLeadingZero}
                    onChange={(e) => setBuilderLeadingZero(e.target.checked)}
                  />
                  <span>{t('settings.numbering.leadingZeroLabel')}</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
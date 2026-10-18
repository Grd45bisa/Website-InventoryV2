import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';
import { api } from '../../utils/api.js';
import './OverdueBubble.css';

/* ── Shared AudioContext (singleton, module-level) ── */
let sharedCtx = null;

// Create eagerly — starts suspended, allowed without gesture
try { sharedCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }

// Resume AudioContext on very first user interaction (runs once)
function bootAudioOnce() {
  if (!sharedCtx || sharedCtx.state === 'running') return;

  let queued = null;
  const handler = () => {
    sharedCtx.resume().then(() => {
      if (typeof queued === 'function') queued();
    }).catch(() => {});
    document.removeEventListener('pointerdown', handler);
  };
  document.addEventListener('pointerdown', handler);

  // Expose a way to queue a callback for when AudioContext becomes running
  sharedCtx._onReady = (fn) => { queued = fn; };
}

bootAudioOnce();

function ensureCtx() {
  if (!sharedCtx) {
    try { sharedCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function playChime() {
  const ctx = sharedCtx;
  if (!ctx || ctx.state !== 'running') return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);
  oscillator.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.4);
}

/* ── Desktop Notification (once-per-ID via localStorage) ── */
const NOTIF_KEY = 'docuflow_notified_ids';

function showDesktopNotif(overdueCount, upcomingCount, lang) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  const parts = [];
  if (overdueCount > 0) {
    parts.push(lang === 'id'
      ? `${overdueCount} tagihan sudah jatuh tempo`
      : `${overdueCount} invoice${overdueCount > 1 ? 's' : ''} overdue`);
  }
  if (upcomingCount > 0) {
    parts.push(lang === 'id'
      ? `${upcomingCount} tagihan segera jatuh tempo`
      : `${upcomingCount} invoice${upcomingCount > 1 ? 's' : ''} due soon`);
  }

  const send = () => {
    new Notification(lang === 'id' ? 'Pengingat Tagihan' : 'Invoice Reminder', { body: parts.join(' • ') });
  };

  if (Notification.permission === 'granted') send();
  else if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => { if (perm === 'granted') send(); });
  }
}

function getNotifiedIds() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; }
}
function saveNotifiedIds(ids) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(ids)); } catch { /* no storage */ }
}

/* ── Component ── */
export default function OverdueBubble() {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const soundQueued = useRef(false);

  const { data: rawDocs } = useQuery({
    queryKey: ['documents', 'completed-invoices'],
    queryFn: async () => {
      const res = await api.get('/api/workspace/documents?type=invoice&status=completed&limit=500');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30000,
  });

  const { overdueCount, upcomingCount, currentIds } = useMemo(() => {
    const docs = rawDocs ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in5Days = new Date(today);
    in5Days.setDate(in5Days.getDate() + 5);
    let over = 0, up = 0, ids = [];

    docs.forEach((d) => {
      const terms = d.payment_terms || 'unpaid:0';
      const [payStatus] = terms.split(':');
      if (payStatus === 'paid' || !d.due_date) return;
      const due = new Date(d.due_date);
      if (due < today) { over++; ids.push(d.id); }
      else if (due <= in5Days) { up++; ids.push(d.id); }
    });

    return { overdueCount: over, upcomingCount: up, currentIds: ids };
  }, [rawDocs]);

  const show = !dismissed && (overdueCount > 0 || upcomingCount > 0);
  const played = useRef(false);

  // Play sound every time the bubble appears (with 1.5s delay)
  useEffect(() => {
    if (!show || played.current) return;
    played.current = true;

    const timer = setTimeout(() => {
      const ctx = ensureCtx();
      if (!ctx) return;

      const tryPlay = () => {
        if (ctx.state === 'running') {
          playChime();
        } else {
          soundQueued.current = true;
          if (typeof ctx._onReady === 'function') {
            ctx._onReady(() => {
              playChime();
              soundQueued.current = false;
            });
          }
        }
      };

      if (ctx.state === 'running') {
        playChime();
      } else {
        ctx.resume().then(() => playChime()).catch(() => {
          tryPlay();
        });
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [show]);

  // Desktop notification: one-time per device per invoice ID
  const notified = useRef(false);
  useEffect(() => {
    if (!show || notified.current) return;
    notified.current = true;

    const prevIds = getNotifiedIds();
    const hasNew = currentIds.some((id) => !prevIds.includes(id));

    if (hasNew) {
      showDesktopNotif(overdueCount, upcomingCount, lang);
    }

    saveNotifiedIds([...new Set([...prevIds, ...currentIds])]);
  }, [show, overdueCount, upcomingCount, currentIds, lang]);

  if (!show) return null;

  const close = () => {
    setDismissed(true);
    if (soundQueued.current) {
      ensureCtx();
      playChime();
      soundQueued.current = false;
    }
  };

  const hasOverdue = overdueCount > 0;

  return (
    <div className={`overdue-bubble ${hasOverdue ? 'overdue-bubble--danger' : 'overdue-bubble--warning'}`}>
      <button
        type="button"
        className="overdue-bubble__close"
        onClick={close}
        aria-label="Tutup"
      >
        <X size={14} />
      </button>

      <div className="overdue-bubble__icon">
        <Clock size={18} />
      </div>

      <div className="overdue-bubble__body">
        <p className="overdue-bubble__title">
          {lang === 'id' ? 'Pengingat Tagihan' : 'Invoice Reminder'}
        </p>
        <div className="overdue-bubble__stats">
          {overdueCount > 0 && (
            <div className="overdue-bubble__stat">
              <span className="overdue-bubble__stat-num overdue-bubble__stat-num--danger">{overdueCount}</span>
              <span className="overdue-bubble__stat-label">
                {lang === 'id' ? 'sudah jatuh tempo' : 'overdue'}
              </span>
            </div>
          )}
          {upcomingCount > 0 && (
            <div className="overdue-bubble__stat">
              <span className="overdue-bubble__stat-num">{upcomingCount}</span>
              <span className="overdue-bubble__stat-label">
                {lang === 'id' ? 'segera jatuh tempo' : 'due soon'}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="overdue-bubble__action"
          onClick={() => navigate('/documents?type=invoice')}
        >
          {lang === 'id' ? 'Lihat Semua' : 'View All'}
        </button>
      </div>
    </div>
  );
}

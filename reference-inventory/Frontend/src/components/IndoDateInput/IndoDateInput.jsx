import React, { useState, useEffect, useRef, useCallback } from "react";
import "./IndoDateInput.css";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const DAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function buildCalendar(year, month) {
  // month: 0-11
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function isoToparts(iso) {
  if (!iso) return { d: "", m: "", y: "" };
  const s = String(iso).slice(0, 10).split("-");
  if (s.length !== 3) return { d: "", m: "", y: "" };
  return { d: s[2], m: s[1], y: s[0] };
}

function partsToIso(d, m, y) {
  const dd = String(d || "").padStart(2, "0");
  const mm = String(m || "").padStart(2, "0");
  if (!dd || !mm || !y || String(y).length !== 4) return null;
  const iso = `${y}-${mm}-${dd}`;
  return isNaN(new Date(iso).getTime()) ? null : iso;
}

export default function IndoDateInput({ value, onChange, disabled = false }) {
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [open, setOpen] = useState(false);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-11

  const wrapRef = useRef(null);
  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const calRef = useRef(null);

  /* ── Sync from prop ── */
  useEffect(() => {
    const { d, m, y } = isoToparts(value);
    setDay(d);
    setMonth(m);
    setYear(y);
    if (y && m) {
      setCalYear(Number(y));
      setCalMonth(Number(m) - 1);
    }
  }, [value]);

  /* ── Close on outside click & Escape key ── */
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  /* ── Emit ISO ── */
  const tryEmit = useCallback(
    (d, m, y) => {
      const iso = partsToIso(d, m, y);
      if (iso) onChange?.(iso);
    },
    [onChange]
  );

  /* ── Text field handlers ── */
  const handleDay = (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (Number(v) > 31) v = "31";
    setDay(v);
    if (v.length === 2) {
      monthRef.current?.focus();
      tryEmit(v, month, year);
    }
  };

  const handleMonth = (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (Number(v) > 12) v = "12";
    setMonth(v);
    if (v.length === 2) {
      yearRef.current?.focus();
      tryEmit(day, v, year);
    }
  };

  const handleYear = (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setYear(v);
    if (v.length === 4) tryEmit(day, month, v);
  };

  const handleDayKeyDown = (e) => {
    if (e.key === "/" || e.key === "Enter") {
      e.preventDefault();
      monthRef.current?.focus();
    }
  };

  const handleMonthKeyDown = (e) => {
    if (e.key === "/" || e.key === "Enter") {
      e.preventDefault();
      yearRef.current?.focus();
    } else if (e.key === "Backspace" && !month) {
      e.preventDefault();
      dayRef.current?.focus();
    }
  };

  const handleYearKeyDown = (e) => {
    if (e.key === "Backspace" && !year) {
      e.preventDefault();
      monthRef.current?.focus();
    }
  };

  const handleDayBlur = () => {
    if (day && day.length === 1) {
      const p = day.padStart(2, "0");
      setDay(p);
      tryEmit(p, month, year);
    }
  };

  const handleMonthBlur = () => {
    if (month && month.length === 1) {
      const p = month.padStart(2, "0");
      setMonth(p);
      tryEmit(day, p, year);
    }
  };

  const handleClear = () => {
    setDay("");
    setMonth("");
    setYear("");
    onChange?.("");
  };

  /* ── Calendar navigation ── */
  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  /* ── Pick a day from calendar ── */
  const pickDay = (d) => {
    const dd = String(d).padStart(2, "0");
    const mm = String(calMonth + 1).padStart(2, "0");
    const yy = String(calYear);
    setDay(dd);
    setMonth(mm);
    setYear(yy);
    const iso = `${yy}-${mm}-${dd}`;
    onChange?.(iso);
    setOpen(false);
  };

  const cells = buildCalendar(calYear, calMonth);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const selectedIso = partsToIso(day, month, year) || "";
  const hasValue = Boolean(day || month || year);

  return (
    <div
      className={`indo-date-input${open ? " is-open" : ""}${disabled ? " indo-date-input--disabled" : ""}`}
      ref={wrapRef}
    >
      {/* ── Text fields ── */}
      <div className="indo-date-input__fields">
        <input
          ref={dayRef}
          type="text"
          inputMode="numeric"
          className="indo-date-input__seg"
          placeholder="HH"
          maxLength={2}
          value={day}
          onChange={handleDay}
          onKeyDown={handleDayKeyDown}
          onBlur={handleDayBlur}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          aria-label="Hari"
        />
        <span className="indo-date-input__sep">/</span>
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          className="indo-date-input__seg"
          placeholder="BB"
          maxLength={2}
          value={month}
          onChange={handleMonth}
          onKeyDown={handleMonthKeyDown}
          onBlur={handleMonthBlur}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          aria-label="Bulan"
        />
        <span className="indo-date-input__sep">/</span>
        <input
          ref={yearRef}
          type="text"
          inputMode="numeric"
          className="indo-date-input__seg indo-date-input__seg--year"
          placeholder="TTTT"
          maxLength={4}
          value={year}
          onChange={handleYear}
          onKeyDown={handleYearKeyDown}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          aria-label="Tahun"
        />
      </div>

      {/* ── Right-side buttons ── */}
      <div className="indo-date-input__actions">
        {hasValue && !disabled && (
          <button
            type="button"
            className="indo-date-input__clear"
            onClick={handleClear}
            aria-label="Hapus tanggal"
            title="Hapus tanggal"
            tabIndex={-1}
          >
            &#215;
          </button>
        )}
        {!disabled && (
          <button
            type="button"
            className={`indo-date-input__cal-btn${open ? " active" : ""}`}
            onClick={() => setOpen((o) => !o)}
            aria-label="Buka kalender"
            title="Pilih tanggal"
            tabIndex={-1}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Calendar Dropdown ── */}
      {open && (
        <div className="indo-date-input__calendar" ref={calRef}>
          {/* Header */}
          <div className="indo-cal__header">
            <button
              type="button"
              className="indo-cal__nav"
              onClick={prevMonth}
              aria-label="Bulan sebelumnya"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="indo-cal__title">
              {MONTHS_ID[calMonth]} {calYear}
            </span>
            <button
              type="button"
              className="indo-cal__nav"
              onClick={nextMonth}
              aria-label="Bulan berikutnya"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Day labels */}
          <div className="indo-cal__grid">
            {DAYS_ID.map((d) => (
              <div key={d} className="indo-cal__day-label">
                {d}
              </div>
            ))}

            {/* Cells */}
            {cells.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} className="indo-cal__cell--empty" />;
              const cellIso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const isToday = cellIso === todayIso;
              const isSelected = cellIso === selectedIso;
              return (
                <button
                  key={cellIso}
                  type="button"
                  className={`indo-cal__cell${isToday ? " indo-cal__cell--today" : ""}${isSelected ? " indo-cal__cell--selected" : ""}`}
                  onClick={() => pickDay(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="indo-cal__footer">
            <button
              type="button"
              className="indo-cal__today-btn"
              onClick={() => {
                setCalYear(today.getFullYear());
                setCalMonth(today.getMonth());
                pickDay(today.getDate());
              }}
            >
              Hari ini
            </button>
            {hasValue && (
              <button
                type="button"
                className="indo-cal__clear-btn"
                onClick={handleClear}
              >
                Hapus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


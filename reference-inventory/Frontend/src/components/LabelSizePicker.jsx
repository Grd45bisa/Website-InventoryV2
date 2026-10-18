import React from 'react';
import { Ruler } from 'lucide-react';
import { LABEL_SIZES } from '../utils/labelPrint.js';
import './LabelSizePicker.css';

export default function LabelSizePicker({ value, onChange, disabled = false, ariaLabel, className = '' }) {
  return (
    <div className={`label-size-picker ${className}`.trim()}>
      <Ruler size={14} className="label-size-picker__icon" />
      <select
        className="input select label-size-picker__select"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.values(LABEL_SIZES).map((size) => (
          <option key={size.key} value={size.key}>
            {size.label}
          </option>
        ))}
      </select>
    </div>
  );
}

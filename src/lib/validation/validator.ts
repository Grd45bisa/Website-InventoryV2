/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Server Validation Utilities
 */

import { AppError } from '../errors/app-error.ts';

export interface ValidationRule<T> {
  field: keyof T;
  validate: (value: unknown, record: T) => boolean;
  message: string;
}

export function validateSchema<T extends object>(
  data: unknown,
  rules: ValidationRule<T>[]
): { valid: true; data: T } | { valid: false; errors: Record<string, string[]> } {
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: { _general: ['Payload harus berupa objek valid'] }
    };
  }

  const typedData = data as T;
  const errors: Record<string, string[]> = {};

  for (const rule of rules) {
    const fieldKey = String(rule.field);
    const value = (typedData as Record<string, unknown>)[fieldKey];

    const isValid = rule.validate(value, typedData);
    if (!isValid) {
      if (!errors[fieldKey]) {
        errors[fieldKey] = [];
      }
      errors[fieldKey].push(rule.message);
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: typedData };
}

export function assertValid<T extends object>(data: unknown, rules: ValidationRule<T>[]): T {
  const result = validateSchema<T>(data, rules);
  if (!result.valid) {
    throw new AppError('ERR_VALIDATION', 'Validasi input gagal', 400, {
      validationErrors: result.errors
    });
  }
  return result.data;
}

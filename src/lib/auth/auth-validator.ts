/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Auth Input Validator (TASK-011)
 * Validasi murni tanpa dependensi Next.js runtime sehingga 100% testable.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedEmail?: string;
}

export function validateSignInInput(
  email?: unknown,
  password?: unknown
): ValidationResult {
  if (typeof email !== "string" || !email.trim()) {
    return {
      valid: false,
      error: "Email wajib diisi.",
    };
  }

  const trimmedEmail = email.trim();
  // Format email standar RFC 5322 ringkas
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return {
      valid: false,
      error: "Format email tidak valid.",
    };
  }

  if (typeof password !== "string" || !password) {
    return {
      valid: false,
      error: "Kata sandi wajib diisi.",
    };
  }

  if (password.length < 6) {
    return {
      valid: false,
      error: "Kata sandi minimal 6 karakter.",
    };
  }

  return {
    valid: true,
    sanitizedEmail: trimmedEmail.toLowerCase(),
  };
}

export function validatePasswordResetInput(email?: unknown): ValidationResult {
  if (typeof email !== "string" || !email.trim()) {
    return {
      valid: false,
      error: "Email wajib diisi untuk pemulihan kata sandi.",
    };
  }

  const trimmedEmail = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return {
      valid: false,
      error: "Format email tidak valid.",
    };
  }

  return {
    valid: true,
    sanitizedEmail: trimmedEmail.toLowerCase(),
  };
}

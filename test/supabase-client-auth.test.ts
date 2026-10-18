/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Supabase Client & Auth SSR Test Suite (TASK-010 & TASK-011)
 * 
 * Cakupan:
 * 1. Validasi Environment Publik & Server-Only (URL, Anon Key, Service Role Key)
 * 2. Proteksi Kebocoran Service Role Key ke Sisi Browser
 * 3. Inisialisasi Supabase Client Browser & Admin
 * 4. Validasi Autentikasi: Input Form Login & Password Reset
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSupabasePublicEnv,
  getSupabaseServiceRoleKey,
} from '../src/lib/supabase/env.ts';
import { createClient as createBrowserSupabaseClient } from '../src/lib/supabase/client.ts';
import { createAdminClient } from '../src/lib/supabase/admin.ts';
import {
  validateSignInInput,
  validatePasswordResetInput,
} from '../src/lib/auth/auth-validator.ts';

describe('TASK-010: Validasi Supabase Environment & Client Initialization', () => {
  test('getSupabasePublicEnv harus berhasil mengekstrak URL dan Anon Key', () => {
    const env = getSupabasePublicEnv();
    assert.ok(env.supabaseUrl, 'supabaseUrl wajib ada');
    assert.ok(env.supabaseAnonKey, 'supabaseAnonKey wajib ada');
    assert.match(env.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co/, 'Format URL project Supabase harus valid');
  });

  test('getSupabaseServiceRoleKey harus berhasil di server dan gagal jika window terdefinisi', () => {
    // 1. Pada environment server (Node.js) -> Berhasil
    const key = getSupabaseServiceRoleKey();
    assert.ok(key, 'Service role key harus ada di server');

    // 2. Simulasi browser environment (window terdefinisi) -> Wajib melempar error keras
    (globalThis as Record<string, unknown>).window = {};
    try {
      assert.throws(
        () => getSupabaseServiceRoleKey(),
        /PELANGGARAN KEAMANAN/,
        'Wajib memblokir akses service-role key dari sisi browser'
      );
    } finally {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  test('createClient browser dan createAdminClient server harus terinisialisasi dengan benar', () => {
    const browserClient = createBrowserSupabaseClient();
    assert.ok(browserClient, 'Browser client harus terbuat');
    assert.ok(browserClient.auth, 'Browser client harus memiliki auth module');

    const adminClient = createAdminClient();
    assert.ok(adminClient, 'Admin client harus terbuat');
    assert.ok(adminClient.auth, 'Admin client harus memiliki auth module');
  });
});

describe('TASK-011: Validasi Input Autentikasi & Pemulihan Kata Sandi', () => {
  test('validateSignInInput: validasi lengkap email dan password', () => {
    // 1. Sukses jika format benar
    const valid = validateSignInInput('operator@docuflow.id', 'rahasia123');
    assert.equal(valid.valid, true);
    assert.equal(valid.sanitizedEmail, 'operator@docuflow.id');

    // 2. Gagal jika email kosong
    const emptyEmail = validateSignInInput('', 'rahasia123');
    assert.equal(emptyEmail.valid, false);
    assert.match(emptyEmail.error || '', /Email wajib diisi/);

    // 3. Gagal jika format email salah
    const invalidEmail = validateSignInInput('bukan-email', 'rahasia123');
    assert.equal(invalidEmail.valid, false);
    assert.match(invalidEmail.error || '', /Format email tidak valid/);

    // 4. Gagal jika password kosong
    const emptyPassword = validateSignInInput('operator@docuflow.id', '');
    assert.equal(emptyPassword.valid, false);
    assert.match(emptyPassword.error || '', /Kata sandi wajib diisi/);

    // 5. Gagal jika password terlalu pendek (< 6 karakter)
    const shortPassword = validateSignInInput('operator@docuflow.id', '123');
    assert.equal(shortPassword.valid, false);
    assert.match(shortPassword.error || '', /minimal 6 karakter/);
  });

  test('validatePasswordResetInput: validasi email pemulihan', () => {
    // 1. Sukses jika format benar
    const valid = validatePasswordResetInput('owner@docuflow.id');
    assert.equal(valid.valid, true);
    assert.equal(valid.sanitizedEmail, 'owner@docuflow.id');

    // 2. Gagal jika email kosong
    const empty = validatePasswordResetInput('');
    assert.equal(empty.valid, false);
    assert.match(empty.error || '', /Email wajib diisi/);

    // 3. Gagal jika format email salah
    const invalid = validatePasswordResetInput('invalid-format');
    assert.equal(invalid.valid, false);
    assert.match(invalid.error || '', /Format email tidak valid/);
  });
});

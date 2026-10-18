/**
 * Fase 2 Test Suite: sitemap navigasi, token terpusat, larangan gradient/emoji,
 * dan kontras token (TASK-015, TASK-017). Bukan pengganti uji visual/keyboard manual.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { NAV_ITEMS, NAV_SECTIONS, findNavItem } from '../src/lib/nav-config.ts';

const SRC = join(import.meta.dirname, '..', 'src');
const GLOBALS = join(SRC, 'app', 'globals.css');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sourceFiles = walk(SRC).filter((f) => /\.(ts|tsx|css)$/.test(f));

// RPD.md 6.1 - sumber kebenaran sitemap.
const RPD_SITEMAP: Array<[string, string]> = [
  ['Dasbor', '/dashboard'],
  ['Dokumen', '/documents'],
  ['Purchase Orders', '/purchase-orders'],
  ['Produk', '/inventory/products'],
  ['Barang Masuk', '/inventory/goods-in'],
  ['Barang Keluar', '/inventory/goods-out'],
  ['Stock Opname', '/inventory/stock-opname'],
  ['Laporan', '/inventory/reports'],
  ['Pelanggan', '/partners/customers'],
  ['Pemasok', '/partners/suppliers'],
  ['Pengaturan', '/settings'],
  ['Log Audit', '/audit-log'],
];

describe('Fase 2: sitemap navigasi (TASK-017)', () => {
  test('menu dan path persis sama dengan RPD 6.1, dalam urutan yang sama', () => {
    assert.deepEqual(
      NAV_ITEMS.map((i) => [i.label, i.href]),
      RPD_SITEMAP,
    );
  });

  test('bagian sesuai WIREFRAME 1.3', () => {
    assert.deepEqual(
      NAV_SECTIONS.map((s) => s.label),
      ['UTAMA', 'TRANSAKSI', 'INVENTORY', 'PELANGGAN & PEMASOK', 'SISTEM'],
    );
  });

  test('tidak ada menu Serial Number terpisah dan path unik', () => {
    assert.equal(NAV_ITEMS.some((i) => /serial|\bsn\b/i.test(i.label + i.href)), false);
    assert.equal(new Set(NAV_ITEMS.map((i) => i.href)).size, NAV_ITEMS.length);
  });

  test('findNavItem mencocokkan halaman dan sub-halaman, bukan prefix parsial', () => {
    assert.equal(findNavItem('/inventory/products')?.item.label, 'Produk');
    assert.equal(findNavItem('/inventory/products/abc')?.item.label, 'Produk');
    assert.equal(findNavItem('/inventory/products-lain'), null);
    assert.equal(findNavItem('/tidak-ada'), null);
  });
});

describe('Fase 2: aturan visual (TASK-015)', () => {
  test('tidak ada gradient di source UI', () => {
    const offenders = sourceFiles.filter((f) => /gradient/i.test(readFileSync(f, 'utf8')));
    assert.deepEqual(offenders, []);
  });

  test('tidak ada emoji di source UI', () => {
    const offenders = sourceFiles.filter((f) => /\p{Extended_Pictographic}/u.test(readFileSync(f, 'utf8')));
    assert.deepEqual(offenders, []);
  });

  test('hex warna hanya didefinisikan di globals.css (token terpusat)', () => {
    const offenders = sourceFiles
      .filter((f) => f !== GLOBALS)
      .filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(offenders, []);
  });
});

function tokens(): Record<string, string> {
  const css = readFileSync(GLOBALS, 'utf8');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('Fase 2: kontras token (WCAG 2.2 AA, dihitung dari globals.css)', () => {
  const t = tokens();

  test('token inti DESIGN_SYSTEM 3.1 ada dan sesuai nilai rekomendasi', () => {
    assert.equal(t['background'].toLowerCase(), '#f7f7f3');
    assert.equal(t['primary'].toLowerCase(), '#276749');
    assert.equal(t['danger'].toLowerCase(), '#b42318');
  });

  test('teks utama/sekunder dan teks pada tombol primer/danger >= 4.5:1', () => {
    for (const bg of ['background', 'surface', 'surface-muted']) {
      assert.ok(contrast(t['text-primary'], t[bg]) >= 4.5, `text-primary pada ${bg}`);
      assert.ok(contrast(t['text-secondary'], t[bg]) >= 4.5, `text-secondary pada ${bg}`);
    }
    assert.ok(contrast(t['surface'], t['primary']) >= 4.5);
    assert.ok(contrast(t['surface'], t['primary-hover']) >= 4.5);
    assert.ok(contrast(t['surface'], t['danger']) >= 4.5);
  });

  test('teks pada latar status lembut (text-primary) >= 4.5:1', () => {
    for (const s of ['primary', 'success', 'warning', 'danger', 'info']) {
      assert.ok(contrast(t['text-primary'], t[`${s}-soft`]) >= 4.5, `${s}-soft`);
    }
  });

  test('warna status sebagai teks/ikon pada surface >= 4.5:1 dan batas kontrol >= 3:1', () => {
    for (const s of ['primary', 'success', 'warning', 'danger', 'info']) {
      assert.ok(contrast(t[s], t['surface']) >= 4.5, `${s} pada surface`);
    }
    assert.ok(contrast(t['border-strong'], t['surface']) >= 3, 'border-strong pada surface');
    assert.ok(contrast(t['border-strong'], t['surface-muted']) >= 3, 'border-strong pada surface-muted');
  });
});

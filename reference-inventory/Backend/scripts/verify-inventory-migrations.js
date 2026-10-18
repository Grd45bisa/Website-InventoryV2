import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'supabase/migrations/000_docuflow_all_in_one_idempotent.sql',
];

const failures = [];
for (const relative of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) failures.push(`Missing ${relative}`);
}

const fullPath = path.join(root, required[0]);
if (fs.existsSync(fullPath)) {
  const sql = fs.readFileSync(fullPath, 'utf8');
  const checks = [
    ['transaction', /BEGIN;[\s\S]*COMMIT;/i],
    ['advisory lock', /pg_advisory_xact_lock/i],
    ['legacy bal multiplier', /'bal'[^\n]*300/i],
    ['atomic completion', /complete_inventory_document/i],
    ['atomic reversal', /reverse_inventory_document/i],
    ['reconciliation', /inventory_reconciliation/i],
    ['schema marker upsert', /ON CONFLICT \(key\) DO UPDATE/i],
    ['staff role migration', /SET role = 'staff'[\s\S]*WHERE role = 'admin'/i],
    ['staff metadata migration', /raw_user_meta_data[\s\S]*'\{role\}'[\s\S]*'"staff"'/i],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(sql)) failures.push(`All-in-one SQL missing ${label}`);
  }
  const dollarPairs = (sql.match(/\$\$/g) || []).length;
  if (dollarPairs % 2 !== 0) failures.push('Unbalanced $$ SQL delimiters');
  if (/\bELIF\b/i.test(sql)) failures.push('Invalid PL/pgSQL ELIF keyword; use ELSIF');
  if (/\bELSEIF\b/i.test(sql)) failures.push('Invalid PL/pgSQL ELSEIF keyword; use ELSIF');
  if (/`[^`]+`/.test(sql)) failures.push('MySQL-style backtick identifier found');
  if (/DEFAULT\s+'admin'/i.test(sql)) failures.push('Legacy admin role is still a profile default');
  if (/jsonb_build_array\([^\n]*'admin'/i.test(sql)) failures.push('Legacy admin role is still seeded in module settings');

  for (const match of sql.matchAll(/CREATE TRIGGER\s+([a-zA-Z0-9_]+)/gi)) {
    const triggerName = match[1];
    const precedingSql = sql.slice(0, match.index);
    const dropPattern = new RegExp(`DROP\\s+TRIGGER\\s+IF\\s+EXISTS\\s+${triggerName}\\b`, 'i');
    if (!dropPattern.test(precedingSql)) failures.push(`Trigger ${triggerName} has no idempotent DROP`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Inventory migration verification passed.');

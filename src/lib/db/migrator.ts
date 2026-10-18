/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * SQLite Migration Runner (TASK-040)
 * Menjalankan schema DDL terstruktur dan melacak versi migration yang sudah diterapkan.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseClient } from "./sqlite-client.ts";

export interface MigrationResult {
  success: boolean;
  applied: string[];
  error?: string;
}

export function runMigrations(db: DatabaseClient): MigrationResult {
  let schemaPath: string;

  try {
    const currentDir = typeof __dirname !== "undefined"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
    schemaPath = path.resolve(currentDir, "schema.sql");
  } catch {
    schemaPath = path.resolve(process.cwd(), "src/lib/db/schema.sql");
  }

  if (!fs.existsSync(/*turbopackIgnore: true*/ schemaPath)) {
    // Fallback jika path relatif berbeda
    const fallback = path.resolve(process.cwd(), "src/lib/db/schema.sql");
    if (fs.existsSync(/*turbopackIgnore: true*/ fallback)) {
      schemaPath = fallback;
    } else {
      throw new Error(`File skema tidak ditemukan di ${schemaPath} maupun ${fallback}`);
    }
  }

  const schemaSql = fs.readFileSync(/*turbopackIgnore: true*/ schemaPath, "utf-8");

  // Inisialisasi tabel pelacak migrasi
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare("SELECT name FROM _migrations").all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const applied: string[] = [];

  const initialMigrationName = "0001_initial_schema";
  if (!appliedSet.has(initialMigrationName)) {
    db.transaction(() => {
      // Jalankan seluruh DDL skema
      db.exec(schemaSql);
      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0001",
        initialMigrationName,
        now
      );
      applied.push(initialMigrationName);
    });
  }

  const secondMigrationName = "0002_transactions_po_invoice_returns";
  if (!appliedSet.has(secondMigrationName)) {
    db.transaction(() => {
      // Jalankan skema lengkap untuk memastikan tabel baru terbuat
      db.exec(schemaSql);
      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0002",
        secondMigrationName,
        now
      );
      applied.push(secondMigrationName);
    });
  }

  const thirdMigrationName = "0003_po_goods_out_integration";
  if (!appliedSet.has(thirdMigrationName)) {
    db.transaction(() => {
      // Periksa dan tambahkan kolom po_id ke goods_out jika belum ada
      const goColumns = db.prepare("PRAGMA table_info(goods_out)").all() as Array<{ name: string }>;
      if (!goColumns.some((c) => c.name === "po_id")) {
        db.exec("ALTER TABLE goods_out ADD COLUMN po_id TEXT REFERENCES purchase_orders(id) ON DELETE RESTRICT;");
      }

      // Periksa dan tambahkan kolom po_line_id ke goods_out_lines jika belum ada
      const golColumns = db.prepare("PRAGMA table_info(goods_out_lines)").all() as Array<{ name: string }>;
      if (!golColumns.some((c) => c.name === "po_line_id")) {
        db.exec("ALTER TABLE goods_out_lines ADD COLUMN po_line_id TEXT REFERENCES purchase_order_lines(id) ON DELETE RESTRICT;");
      }

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0003",
        thirdMigrationName,
        now
      );
      applied.push(thirdMigrationName);
    });
  }

  const fourthMigrationName = "0004_commercial_documents_print_count";
  if (!appliedSet.has(fourthMigrationName)) {
    db.transaction(() => {
      const cdColumns = db.prepare("PRAGMA table_info(commercial_documents)").all() as Array<{ name: string }>;
      if (!cdColumns.some((c) => c.name === "print_count")) {
        db.exec("ALTER TABLE commercial_documents ADD COLUMN print_count INTEGER NOT NULL DEFAULT 0;");
      }

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0004",
        fourthMigrationName,
        now
      );
      applied.push(fourthMigrationName);
    });
  }

  const fifthMigrationName = "0005_commercial_document_lines";
  if (!appliedSet.has(fifthMigrationName)) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS commercial_document_lines (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          document_id TEXT NOT NULL REFERENCES commercial_documents(id) ON DELETE CASCADE,
          source_order_item_id TEXT REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          description_snapshot TEXT,
          quantity NUMERIC NOT NULL CHECK (quantity > 0),
          unit_price NUMERIC NOT NULL DEFAULT 0,
          discount_type TEXT NOT NULL DEFAULT 'NOMINAL' CHECK (discount_type IN ('NOMINAL', 'PERCENTAGE', 'NONE')),
          discount_value NUMERIC NOT NULL DEFAULT 0,
          line_total NUMERIC NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_comm_doc_lines_doc ON commercial_document_lines(owner_id, document_id);
      `);

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0005",
        fifthMigrationName,
        now
      );
      applied.push(fifthMigrationName);
    });
  }

  const sixthMigrationName = "0006_add_sample_document_type";
  if (!appliedSet.has(sixthMigrationName)) {
    db.transaction(() => {
      db.exec("PRAGMA foreign_keys = OFF;");

      db.exec(`
        CREATE TABLE IF NOT EXISTS commercial_documents_new (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
          po_id TEXT REFERENCES purchase_orders(id) ON DELETE RESTRICT,
          document_number TEXT NOT NULL,
          document_date TEXT NOT NULL,
          due_date TEXT NOT NULL,
          document_type TEXT NOT NULL DEFAULT 'INVOICE' CHECK (document_type IN ('INVOICE', 'SAMPLE', 'SURAT_JALAN', 'RECEIPT')),
          status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
          subtotal NUMERIC NOT NULL DEFAULT 0,
          item_discount NUMERIC NOT NULL DEFAULT 0,
          doc_nominal_discount NUMERIC NOT NULL DEFAULT 0,
          doc_percentage_discount NUMERIC NOT NULL DEFAULT 0,
          points_redeemed NUMERIC NOT NULL DEFAULT 0,
          total_amount NUMERIC NOT NULL DEFAULT 0,
          paid_amount NUMERIC NOT NULL DEFAULT 0,
          print_count INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(owner_id, document_number)
        );

        INSERT INTO commercial_documents_new (
          id, owner_id, customer_id, po_id, document_number, document_date, due_date,
          document_type, status, subtotal, item_discount, doc_nominal_discount,
          doc_percentage_discount, points_redeemed, total_amount, paid_amount,
          print_count, notes, created_by_user_id, created_at, updated_at
        )
        SELECT
          id, owner_id, customer_id, po_id, document_number, document_date, due_date,
          document_type, status, subtotal, item_discount, doc_nominal_discount,
          doc_percentage_discount, points_redeemed, total_amount, paid_amount,
          COALESCE(print_count, 0), notes, created_by_user_id, created_at, updated_at
        FROM commercial_documents;

        DROP TABLE commercial_documents;
        ALTER TABLE commercial_documents_new RENAME TO commercial_documents;
        CREATE INDEX IF NOT EXISTS idx_comm_docs_owner ON commercial_documents(owner_id, customer_id);
      `);

      db.exec("PRAGMA foreign_keys = ON;");

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0006",
        sixthMigrationName,
        now
      );
      applied.push(sixthMigrationName);
    });
  }

  const seventhMigrationName = "0007_add_payment_proof_columns";
  if (!appliedSet.has(seventhMigrationName)) {
    db.transaction(() => {
      // Periksa apakah kolom sudah ada sebelum ALTER TABLE ADD COLUMN
      const tableInfo = db.prepare("PRAGMA table_info(document_payments);").all() as Array<{ name: string }>;
      const existingCols = new Set(tableInfo.map((c) => c.name));

      if (!existingCols.has("proof_mime_type")) {
        db.exec("ALTER TABLE document_payments ADD COLUMN proof_mime_type TEXT;");
      }
      if (!existingCols.has("proof_base64")) {
        db.exec("ALTER TABLE document_payments ADD COLUMN proof_base64 TEXT;");
      }
      if (!existingCols.has("proof_file_name")) {
        db.exec("ALTER TABLE document_payments ADD COLUMN proof_file_name TEXT;");
      }
      if (!existingCols.has("proof_file_size")) {
        db.exec("ALTER TABLE document_payments ADD COLUMN proof_file_size INTEGER;");
      }

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0007",
        seventhMigrationName,
        now
      );
      applied.push(seventhMigrationName);
    });
  }

  const eighthMigrationName = "0008_product_serials_unit_representation";
  if (!appliedSet.has(eighthMigrationName)) {
    db.transaction(() => {
      const psColumns = db.prepare("PRAGMA table_info(product_serials)").all() as Array<{ name: string }>;
      const existingCols = new Set(psColumns.map((c) => c.name));

      if (!existingCols.has("unit")) {
        db.exec("ALTER TABLE product_serials ADD COLUMN unit TEXT NOT NULL DEFAULT 'pcs';");
      }
      if (!existingCols.has("unit_quantity")) {
        db.exec("ALTER TABLE product_serials ADD COLUMN unit_quantity NUMERIC NOT NULL DEFAULT 1;");
      }
      if (!existingCols.has("base_quantity")) {
        db.exec("ALTER TABLE product_serials ADD COLUMN base_quantity NUMERIC NOT NULL DEFAULT 1;");
      }
      if (!existingCols.has("source_goods_in_id")) {
        db.exec("ALTER TABLE product_serials ADD COLUMN source_goods_in_id TEXT REFERENCES goods_in(id);");
      }
      if (!existingCols.has("source_line_id")) {
        db.exec("ALTER TABLE product_serials ADD COLUMN source_line_id TEXT REFERENCES goods_in_lines(id);");
      }

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0008",
        eighthMigrationName,
        now
      );
      applied.push(eighthMigrationName);
    });
  }

  const ninthMigrationName = "0009_warehouse_conversion_display_unit";
  if (!appliedSet.has(ninthMigrationName)) {
    db.transaction(() => {
      const whColumns = db.prepare("PRAGMA table_info(warehouses)").all() as Array<{ name: string }>;
      const existingCols = new Set(whColumns.map((c) => c.name));

      if (!existingCols.has("conversion_display_unit")) {
        db.exec("ALTER TABLE warehouses ADD COLUMN conversion_display_unit TEXT NOT NULL DEFAULT 'pcs';");
      }

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0009",
        ninthMigrationName,
        now
      );
      applied.push(ninthMigrationName);
    });
  }

  const tenthMigrationName = "0010_customer_enhancements_and_points";
  if (!appliedSet.has(tenthMigrationName)) {
    db.transaction(() => {
      // 1. Tambah kolom ke tabel customers
      const custCols = db.prepare("PRAGMA table_info(customers)").all() as Array<{ name: string }>;
      const existingCustCols = new Set(custCols.map((c) => c.name));
      if (!existingCustCols.has("owner_name")) {
        db.exec("ALTER TABLE customers ADD COLUMN owner_name TEXT;");
      }
      if (!existingCustCols.has("pic_sales")) {
        db.exec("ALTER TABLE customers ADD COLUMN pic_sales TEXT;");
      }

      // 2. Tambah kolom ke tabel commercial_documents
      const docCols = db.prepare("PRAGMA table_info(commercial_documents)").all() as Array<{ name: string }>;
      const existingDocCols = new Set(docCols.map((c) => c.name));
      if (!existingDocCols.has("shop_discount_note")) {
        db.exec("ALTER TABLE commercial_documents ADD COLUMN shop_discount_note TEXT;");
      }
      if (!existingDocCols.has("cashback_type")) {
        db.exec("ALTER TABLE commercial_documents ADD COLUMN cashback_type TEXT NOT NULL DEFAULT 'NONE';");
      }
      if (!existingDocCols.has("cashback_value")) {
        db.exec("ALTER TABLE commercial_documents ADD COLUMN cashback_value NUMERIC NOT NULL DEFAULT 0;");
      }
      if (!existingDocCols.has("cashback_amount")) {
        db.exec("ALTER TABLE commercial_documents ADD COLUMN cashback_amount NUMERIC NOT NULL DEFAULT 0;");
      }

      // 3. Buat tabel customer_point_ledger jika belum ada
      db.exec(`
        CREATE TABLE IF NOT EXISTS customer_point_ledger (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
          document_id TEXT REFERENCES commercial_documents(id) ON DELETE SET NULL,
          entry_type TEXT NOT NULL CHECK (entry_type IN ('EARNED_PENDING', 'EARNED_AVAILABLE', 'REDEEMED', 'REVERSED', 'ADJUSTED')),
          points NUMERIC NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_point_ledger_customer ON customer_point_ledger(owner_id, customer_id, entry_type);
      `);

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0010",
        tenthMigrationName,
        now
      );
      applied.push(tenthMigrationName);
    });
  }

  const eleventhMigrationName = "0011_warehouse_binding_and_isolation";
  if (!appliedSet.has(eleventhMigrationName)) {
    db.transaction(() => {
      // 1. Tambah kolom warehouse_id ke tabel commercial_documents jika belum ada
      const docCols = db.prepare("PRAGMA table_info(commercial_documents)").all() as Array<{ name: string }>;
      const existingDocCols = new Set(docCols.map((c) => c.name));
      if (!existingDocCols.has("warehouse_id")) {
        db.exec("ALTER TABLE commercial_documents ADD COLUMN warehouse_id TEXT REFERENCES warehouses(id);");
      }

      // 2. Backfill existing rows dengan gudang aktif primer milik Owner
      db.exec(`
        UPDATE commercial_documents
        SET warehouse_id = (
          SELECT id FROM warehouses
          WHERE warehouses.owner_id = commercial_documents.owner_id
            AND warehouses.status = 'ACTIVE'
          ORDER BY id ASC
          LIMIT 1
        )
        WHERE warehouse_id IS NULL;
      `);

      // 3. Index untuk isolasi per owner dan warehouse
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_comm_docs_owner_wh
        ON commercial_documents(owner_id, warehouse_id);
      `);

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0011",
        eleventhMigrationName,
        now
      );
      applied.push(eleventhMigrationName);
    });
  }

  const twelfthMigrationName = "0012_purchase_order_lifecycle_mapping_and_units";
  if (!appliedSet.has(twelfthMigrationName)) {
    db.exec("PRAGMA foreign_keys = OFF;");
    try {
      db.transaction(() => {
        // 1. Recreate purchase_orders dengan kolom warehouse_id, sales_pic, approval fields & status PENDING_APPROVAL / REJECTED
      db.exec(`
        CREATE TABLE IF NOT EXISTS purchase_orders_new (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          warehouse_id TEXT REFERENCES warehouses(id) ON DELETE RESTRICT,
          customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
          po_number TEXT NOT NULL,
          order_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'REJECTED')),
          total_amount NUMERIC NOT NULL DEFAULT 0,
          notes TEXT,
          sales_pic TEXT,
          approved_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
          approved_at TEXT,
          rejected_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
          rejected_at TEXT,
          rejection_reason TEXT,
          created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(owner_id, po_number)
        );

        INSERT INTO purchase_orders_new (
          id, owner_id, warehouse_id, customer_id, po_number, order_date, status,
          total_amount, notes, sales_pic, approved_by_user_id, approved_at,
          rejected_by_user_id, rejected_at, rejection_reason, created_by_user_id,
          created_at, updated_at
        )
        SELECT
          po.id,
          po.owner_id,
          (
            SELECT id FROM warehouses
            WHERE warehouses.owner_id = po.owner_id
              AND warehouses.status = 'ACTIVE'
            ORDER BY id ASC
            LIMIT 1
          ),
          po.customer_id,
          po.po_number,
          po.order_date,
          po.status,
          po.total_amount,
          po.notes,
          (SELECT full_name FROM users WHERE users.id = po.created_by_user_id),
          NULL, NULL, NULL, NULL, NULL,
          po.created_by_user_id,
          po.created_at,
          po.updated_at
        FROM purchase_orders po;

        DROP TABLE purchase_orders;
        ALTER TABLE purchase_orders_new RENAME TO purchase_orders;
        CREATE INDEX IF NOT EXISTS idx_po_owner ON purchase_orders(owner_id, customer_id);
        CREATE INDEX IF NOT EXISTS idx_po_owner_wh ON purchase_orders(owner_id, warehouse_id);
      `);

      // 2. Recreate purchase_order_lines dengan product_id nullable, raw_product_name, ordered_qty, ordered_unit, conversion_factor, mapping_status
      db.exec(`
        CREATE TABLE IF NOT EXISTS purchase_order_lines_new (
          id TEXT PRIMARY KEY,
          po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
          raw_product_name TEXT NOT NULL,
          ordered_qty NUMERIC NOT NULL DEFAULT 1 CHECK (ordered_qty > 0),
          ordered_unit TEXT NOT NULL DEFAULT 'PCS' CHECK (ordered_unit IN ('PCS', 'Lusin', 'pcs', 'lusin', 'unit')),
          conversion_factor NUMERIC NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
          mapping_status TEXT NOT NULL DEFAULT 'UNMAPPED' CHECK (mapping_status IN ('UNMAPPED', 'CATALOG_MATCHED', 'MAPPED', 'CONVERTED_TO_CATALOG')),
          target_qty NUMERIC NOT NULL DEFAULT 0,
          fulfilled_qty NUMERIC NOT NULL DEFAULT 0 CHECK (fulfilled_qty >= 0),
          unit_price NUMERIC NOT NULL DEFAULT 0,
          discount_amount NUMERIC NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        INSERT INTO purchase_order_lines_new (
          id, po_id, product_id, raw_product_name, ordered_qty, ordered_unit,
          conversion_factor, mapping_status, target_qty, fulfilled_qty,
          unit_price, discount_amount, created_at
        )
        SELECT
          pol.id,
          pol.po_id,
          pol.product_id,
          COALESCE((SELECT name FROM products WHERE products.id = pol.product_id), 'Produk Pesanan'),
          pol.target_qty,
          'PCS',
          1,
          CASE WHEN pol.product_id IS NOT NULL THEN 'CATALOG_MATCHED' ELSE 'UNMAPPED' END,
          pol.target_qty,
          pol.fulfilled_qty,
          pol.unit_price,
          pol.discount_amount,
          pol.created_at
        FROM purchase_order_lines pol;

        DROP TABLE purchase_order_lines;
        ALTER TABLE purchase_order_lines_new RENAME TO purchase_order_lines;
        CREATE INDEX IF NOT EXISTS idx_pol_po_id ON purchase_order_lines(po_id);
        CREATE INDEX IF NOT EXISTS idx_pol_product ON purchase_order_lines(product_id);
      `);

        const now = new Date().toISOString();
        db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
          "mig-0012",
          twelfthMigrationName,
          now
        );
        applied.push(twelfthMigrationName);
      });
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  const thirteenthMigrationName = "0013_commercial_document_lines_unit_and_product_name";
  if (!appliedSet.has(thirteenthMigrationName)) {
    db.exec("PRAGMA foreign_keys = OFF;");
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS commercial_document_lines_new (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
            document_id TEXT NOT NULL REFERENCES commercial_documents(id) ON DELETE CASCADE,
            source_order_item_id TEXT REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
            product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
            product_name TEXT,
            description_snapshot TEXT,
            quantity NUMERIC NOT NULL CHECK (quantity > 0),
            unit TEXT NOT NULL DEFAULT 'PCS',
            unit_price NUMERIC NOT NULL DEFAULT 0,
            discount_type TEXT NOT NULL DEFAULT 'NOMINAL' CHECK (discount_type IN ('NOMINAL', 'PERCENTAGE', 'NONE')),
            discount_value NUMERIC NOT NULL DEFAULT 0,
            line_total NUMERIC NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          );

          INSERT INTO commercial_document_lines_new (
            id, owner_id, document_id, source_order_item_id, product_id,
            product_name, description_snapshot, quantity, unit,
            unit_price, discount_type, discount_value, line_total, created_at
          )
          SELECT
            cdl.id,
            cdl.owner_id,
            cdl.document_id,
            cdl.source_order_item_id,
            cdl.product_id,
            COALESCE((SELECT name FROM products WHERE products.id = cdl.product_id), cdl.description_snapshot, 'Produk'),
            cdl.description_snapshot,
            cdl.quantity,
            COALESCE((SELECT unit FROM products WHERE products.id = cdl.product_id), 'PCS'),
            cdl.unit_price,
            cdl.discount_type,
            cdl.discount_value,
            cdl.line_total,
            cdl.created_at
          FROM commercial_document_lines cdl;

          DROP TABLE commercial_document_lines;
          ALTER TABLE commercial_document_lines_new RENAME TO commercial_document_lines;
          CREATE INDEX IF NOT EXISTS idx_comm_doc_lines_doc ON commercial_document_lines(owner_id, document_id);
          CREATE INDEX IF NOT EXISTS idx_comm_doc_lines_product ON commercial_document_lines(product_id);
        `);

        const now = new Date().toISOString();
        db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
          "mig-0013",
          thirteenthMigrationName,
          now
        );
        applied.push(thirteenthMigrationName);
      });
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  const fourteenthMigrationName = "0014_stock_opname_phase2_foundation";
  if (!appliedSet.has(fourteenthMigrationName)) {
    db.transaction(() => {
      // 1. Kolom tambahan untuk stock_opname_sessions
      const soCols = db.prepare("PRAGMA table_info(stock_opname_sessions)").all() as Array<{ name: string }>;
      const existingSoCols = new Set(soCols.map((c) => c.name));
      if (!existingSoCols.has("title")) {
        db.exec("ALTER TABLE stock_opname_sessions ADD COLUMN title TEXT;");
      }
      if (!existingSoCols.has("scope_config")) {
        db.exec("ALTER TABLE stock_opname_sessions ADD COLUMN scope_config TEXT DEFAULT '{\"type\":\"ALL\"}';");
      }
      if (!existingSoCols.has("snapshot_at")) {
        db.exec("ALTER TABLE stock_opname_sessions ADD COLUMN snapshot_at TEXT;");
      }
      if (!existingSoCols.has("finalized_by_user_id")) {
        db.exec("ALTER TABLE stock_opname_sessions ADD COLUMN finalized_by_user_id TEXT REFERENCES users(id);");
      }

      // 2. Kolom tambahan untuk stock_opname_lines
      const lineCols = db.prepare("PRAGMA table_info(stock_opname_lines)").all() as Array<{ name: string }>;
      const existingLineCols = new Set(lineCols.map((c) => c.name));
      if (!existingLineCols.has("unit")) {
        db.exec("ALTER TABLE stock_opname_lines ADD COLUMN unit TEXT NOT NULL DEFAULT 'pcs';");
      }
      if (!existingLineCols.has("dynamic_book_qty")) {
        db.exec("ALTER TABLE stock_opname_lines ADD COLUMN dynamic_book_qty NUMERIC;");
      }
      if (!existingLineCols.has("reconciliation_status")) {
        db.exec("ALTER TABLE stock_opname_lines ADD COLUMN reconciliation_status TEXT;");
      }

      // 3. Tabel stock_opname_areas
      db.exec(`
        CREATE TABLE IF NOT EXISTS stock_opname_areas (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          location_code TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
          assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(session_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_so_areas_session ON stock_opname_areas(session_id);
        CREATE INDEX IF NOT EXISTS idx_so_areas_warehouse ON stock_opname_areas(owner_id, warehouse_id);
      `);

      // 4. Tabel stock_opname_area_counts
      db.exec(`
        CREATE TABLE IF NOT EXISTS stock_opname_area_counts (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
          area_id TEXT NOT NULL REFERENCES stock_opname_areas(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          counted_qty_base NUMERIC NOT NULL DEFAULT 0,
          unit TEXT NOT NULL DEFAULT 'pcs',
          unit_quantity NUMERIC NOT NULL DEFAULT 1,
          scanned_serials_json TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(area_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS idx_so_area_counts_area ON stock_opname_area_counts(area_id);
        CREATE INDEX IF NOT EXISTS idx_so_area_counts_session ON stock_opname_area_counts(session_id);
      `);

      // 5. Tabel stock_opname_serial_snapshots
      db.exec(`
        CREATE TABLE IF NOT EXISTS stock_opname_serial_snapshots (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          serial_number TEXT NOT NULL,
          normalized_serial_number TEXT NOT NULL,
          unit TEXT NOT NULL DEFAULT 'pcs',
          unit_quantity NUMERIC NOT NULL DEFAULT 1,
          base_quantity NUMERIC NOT NULL DEFAULT 1,
          status_at_snapshot TEXT NOT NULL,
          snapshot_at TEXT NOT NULL,
          UNIQUE(session_id, normalized_serial_number)
        );
        CREATE INDEX IF NOT EXISTS idx_so_sn_snapshot_session ON stock_opname_serial_snapshots(session_id, product_id);
        CREATE INDEX IF NOT EXISTS idx_so_sn_snapshot_sn ON stock_opname_serial_snapshots(owner_id, warehouse_id, normalized_serial_number);
      `);

      // 6. Tabel stock_opname_scan_errors
      db.exec(`
        CREATE TABLE IF NOT EXISTS stock_opname_scan_errors (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
          warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE CASCADE,
          area_id TEXT NOT NULL REFERENCES stock_opname_areas(id) ON DELETE CASCADE,
          scanned_value TEXT NOT NULL,
          error_type TEXT NOT NULL,
          error_message TEXT,
          is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_so_scan_errors_area ON stock_opname_scan_errors(area_id);
        CREATE INDEX IF NOT EXISTS idx_so_scan_errors_session ON stock_opname_scan_errors(session_id);
      `);

      const now = new Date().toISOString();
      db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
        "mig-0014",
        fourteenthMigrationName,
        now
      );
      applied.push(fourteenthMigrationName);
    });
  }

  return {
    success: true,
    applied,
  };
}


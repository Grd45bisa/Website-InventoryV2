/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Suite Pengujian Otomatis: Tenant Isolation, Warehouse Ownership & Clean Login
 * Memvalidasi 20 Kriteria Pengujian Sesuai Master Prompt V2.4.1 Bagian F
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getDatabaseClient } from "../src/lib/db/sqlite-client.ts";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import {
  InventoryRepository,
  type CreateCommercialDocumentInput,
} from "../src/lib/db/repositories/inventory-repository.ts";
import { evaluateSecurityContext } from "../src/lib/auth/context-evaluator.ts";
import type {
  ActiveSecurityContext,
  UserSession,
  OwnerMembership,
  WarehouseAssignment,
  SuperAdminGrant,
} from "../src/lib/types/auth.ts";

// Inisialisasi database sebelum pengujian
const db = getDatabaseClient();
runMigrations(db);
seedSyntheticData(db);
const repo = new InventoryRepository();

test("TENANT ISOLATION, WAREHOUSE OWNERSHIP & LOGIN VERIFICATION (20 CASES)", async (t) => {
  // -------------------------------------------------------------
  // Bagian 1: Kepemilikan & Isolasi Gudang Super Admin
  // -------------------------------------------------------------

  await t.test("1. Super Admin memiliki tepat dua gudang internal (wh-sa-01 & wh-sa-02)", () => {
    const warehouses = db
      .prepare(
        "SELECT id, code, name FROM warehouses WHERE owner_id = 'owner-super-admin' ORDER BY code"
      )
      .all() as Array<{ id: string; code: string; name: string }>;

    assert.equal(warehouses.length, 2, "Super Admin harus memiliki tepat 2 gudang internal");
    assert.equal(warehouses[0].id, "wh-sa-01");
    assert.equal(warehouses[0].code, "WH-SA-01");
    assert.equal(warehouses[0].name, "Gudang SA-01");

    assert.equal(warehouses[1].id, "wh-sa-02");
    assert.equal(warehouses[1].code, "WH-SA-02");
    assert.equal(warehouses[1].name, "Gudang SA-02");
  });

  await t.test("2. Super Admin dapat berpindah antara Gudang SA-01 dan Gudang SA-02", () => {
    const saSession: UserSession = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      fullName: "Super Admin",
      isSuperAdmin: true,
    };

    const saMembership: OwnerMembership = {
      id: "mem-sa-internal",
      userId: "usr-super-admin",
      ownerId: "owner-super-admin",
      ownerName: "DocuFlow Internal Operations",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    };

    const ctxSA01 = evaluateSecurityContext({
      session: saSession,
      requestedOwnerId: "owner-super-admin",
      requestedWarehouseId: "wh-sa-01",
      requestedWarehouseName: "Gudang SA-01",
      memberships: [saMembership],
      warehouseAssignments: [],
    });

    const ctxSA02 = evaluateSecurityContext({
      session: saSession,
      requestedOwnerId: "owner-super-admin",
      requestedWarehouseId: "wh-sa-02",
      requestedWarehouseName: "Gudang SA-02",
      memberships: [saMembership],
      warehouseAssignments: [],
    });

    assert.equal(ctxSA01.warehouseId, "wh-sa-01");
    assert.equal(ctxSA01.ownerId, "owner-super-admin");
    assert.equal(ctxSA01.isSuperAdminOnBehalf, false);

    assert.equal(ctxSA02.warehouseId, "wh-sa-02");
    assert.equal(ctxSA02.ownerId, "owner-super-admin");
    assert.equal(ctxSA02.isSuperAdminOnBehalf, false);
  });

  await t.test("3. Data produk dan dokumen Gudang SA-01 tidak muncul saat aktif di SA-02", () => {
    const ctxSA02: ActiveSecurityContext = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      role: "SUPER_ADMIN",
      ownerId: "owner-super-admin",
      ownerName: "DocuFlow Internal Operations",
      warehouseId: "wh-sa-02",
      warehouseName: "Gudang SA-02",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // Produk SA-01
    const prodsInSA02 = repo.getProductsByOwner(ctxSA02);
    const sa01Prod = prodsInSA02.find((p) => p.sku === "SA01-SRV-01");
    assert.equal(sa01Prod, undefined, "Produk SA-01 tidak boleh muncul di Gudang SA-02");

    // Dokumen komersial SA-01
    const docsInSA02 = repo.getCommercialDocuments(ctxSA02);
    const sa01Doc = docsInSA02.find((d) => d.documentNumber === "INV-SA01-2026-001");
    assert.equal(sa01Doc, undefined, "Invoice SA-01 tidak boleh muncul di Gudang SA-02");
  });

  await t.test("4. Data produk dan dokumen Gudang SA-02 tidak muncul saat aktif di SA-01", () => {
    const ctxSA01: ActiveSecurityContext = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      role: "SUPER_ADMIN",
      ownerId: "owner-super-admin",
      ownerName: "DocuFlow Internal Operations",
      warehouseId: "wh-sa-01",
      warehouseName: "Gudang SA-01",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // Produk SA-02
    const prodsInSA01 = repo.getProductsByOwner(ctxSA01);
    const sa02Prod = prodsInSA01.find((p) => p.sku === "SA02-SWT-01");
    assert.equal(sa02Prod, undefined, "Produk SA-02 tidak boleh muncul di Gudang SA-01");

    // Dokumen komersial SA-02
    const docsInSA01 = repo.getCommercialDocuments(ctxSA01);
    const sa02Doc = docsInSA01.find((d) => d.documentNumber === "INV-SA02-2026-001");
    assert.equal(sa02Doc, undefined, "Invoice SA-02 tidak boleh muncul di Gudang SA-01");
  });

  // -------------------------------------------------------------
  // Bagian 2: Proteksi Akses Klien Super Admin (Grant Enforcement)
  // -------------------------------------------------------------

  await t.test("5. Super Admin dilarang mengakses Owner Alpha tanpa active grant yang sah (ERR_FORBIDDEN_SUPERADMIN_NO_GRANT)", () => {
    const saSession: UserSession = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      fullName: "Super Admin",
      isSuperAdmin: true,
    };

    assert.throws(
      () => {
        evaluateSecurityContext({
          session: saSession,
          requestedOwnerId: "owner-alpha",
          requestedWarehouseId: "wh-north",
          memberships: [],
          warehouseAssignments: [],
          activeGrants: [], // Tanpa grant
        });
      },
      (err: any) => {
        return err?.code === "ERR_FORBIDDEN_SUPERADMIN_NO_GRANT";
      }
    );
  });

  await t.test("6. Super Admin dilarang mengakses Owner Beta tanpa active grant yang sah", () => {
    const saSession: UserSession = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      fullName: "Super Admin",
      isSuperAdmin: true,
    };

    assert.throws(
      () => {
        evaluateSecurityContext({
          session: saSession,
          requestedOwnerId: "owner-beta",
          requestedWarehouseId: "wh-beta-01",
          memberships: [],
          warehouseAssignments: [],
          activeGrants: [],
        });
      },
      (err: any) => {
        return err?.code === "ERR_FORBIDDEN_SUPERADMIN_NO_GRANT";
      }
    );
  });

  await t.test("7. Super Admin dengan active grant sah dapat mengakses tenant yang ditunjuk secara on-behalf", () => {
    const saSession: UserSession = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      fullName: "Super Admin",
      isSuperAdmin: true,
    };

    const validGrant: SuperAdminGrant = {
      id: "grant-test-alpha",
      superAdminUserId: "usr-super-admin",
      targetOwnerId: "owner-alpha",
      scope: "MAINTENANCE",
      grantedBy: "usr-owner-alpha",
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revokedAt: null,
    };

    const ctx = evaluateSecurityContext({
      session: saSession,
      requestedOwnerId: "owner-alpha",
      requestedWarehouseId: "wh-north",
      memberships: [],
      warehouseAssignments: [],
      activeGrants: [validGrant],
    });

    assert.equal(ctx.ownerId, "owner-alpha");
    assert.equal(ctx.isSuperAdminOnBehalf, true);
    assert.equal(ctx.grantId, "grant-test-alpha");
    assert.equal(ctx.role, "SUPER_ADMIN");
  });

  await t.test("8. Grant yang sudah kedaluwarsa atau dicabut menolak akses Super Admin dengan kode 403", () => {
    const saSession: UserSession = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      fullName: "Super Admin",
      isSuperAdmin: true,
    };

    // Grant kedaluwarsa
    const expiredGrant: SuperAdminGrant = {
      id: "grant-expired",
      superAdminUserId: "usr-super-admin",
      targetOwnerId: "owner-alpha",
      scope: "SUPPORT",
      grantedBy: "usr-owner-alpha",
      startsAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-02T00:00:00Z",
      revokedAt: null,
    };

    // Grant dicabut (revoked)
    const revokedGrant: SuperAdminGrant = {
      id: "grant-revoked",
      superAdminUserId: "usr-super-admin",
      targetOwnerId: "owner-alpha",
      scope: "SUPPORT",
      grantedBy: "usr-owner-alpha",
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revokedAt: new Date(Date.now() - 1000).toISOString(),
    };

    assert.throws(
      () => {
        evaluateSecurityContext({
          session: saSession,
          requestedOwnerId: "owner-alpha",
          requestedWarehouseId: "wh-north",
          memberships: [],
          warehouseAssignments: [],
          activeGrants: [expiredGrant],
        });
      },
      (err: any) => err?.code === "ERR_FORBIDDEN_SUPERADMIN_NO_GRANT" && err?.statusCode === 403
    );

    assert.throws(
      () => {
        evaluateSecurityContext({
          session: saSession,
          requestedOwnerId: "owner-alpha",
          requestedWarehouseId: "wh-north",
          memberships: [],
          warehouseAssignments: [],
          activeGrants: [revokedGrant],
        });
      },
      (err: any) => err?.code === "ERR_FORBIDDEN_SUPERADMIN_NO_GRANT" && err?.statusCode === 403
    );
  });

  // -------------------------------------------------------------
  // Bagian 3: Batasan Gudang Klien (Single Warehouse Boundary)
  // -------------------------------------------------------------

  await t.test("9. Owner Alpha hanya memiliki tepat satu gudang operasional aktif (wh-north)", () => {
    const whAlpha = db
      .prepare("SELECT id, code, name, status FROM warehouses WHERE owner_id = 'owner-alpha' AND status = 'ACTIVE'")
      .all() as Array<{ id: string; code: string; name: string; status: string }>;

    assert.equal(whAlpha.length, 1, "Owner Alpha harus memiliki tepat satu gudang operasional aktif");
    assert.equal(whAlpha[0].id, "wh-north");
  });

  await t.test("10. Owner Beta hanya memiliki tepat satu gudang operasional aktif (wh-beta-01)", () => {
    const whBeta = db
      .prepare("SELECT id, code, name, status FROM warehouses WHERE owner_id = 'owner-beta' AND status = 'ACTIVE'")
      .all() as Array<{ id: string; code: string; name: string; status: string }>;

    assert.equal(whBeta.length, 1, "Owner Beta harus memiliki tepat satu gudang operasional aktif");
    assert.equal(whBeta[0].id, "wh-beta-01");
  });

  await t.test("11. Owner Alpha tidak dapat melihat produk atau dokumen milik Owner Beta", () => {
    const ctxAlpha: ActiveSecurityContext = {
      userId: "usr-owner-alpha",
      email: "owner_alpha@docuflow.id",
      role: "OWNER",
      ownerId: "owner-alpha",
      ownerName: "Owner Alpha",
      warehouseId: "wh-north",
      warehouseName: "Gudang Utara Alpha",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const prods = repo.getProductsByOwner(ctxAlpha);
    const betaProd = prods.find((p) => p.sku === "BETA-RTR-01");
    assert.equal(betaProd, undefined, "Owner Alpha tidak boleh melihat produk milik Owner Beta");

    const docs = repo.getCommercialDocuments(ctxAlpha);
    const betaDoc = docs.find((d) => d.ownerId === "owner-beta");
    assert.equal(betaDoc, undefined, "Owner Alpha tidak boleh melihat dokumen milik Owner Beta");
  });

  await t.test("12. Owner Beta tidak dapat melihat produk atau dokumen milik Owner Alpha", () => {
    const ctxBeta: ActiveSecurityContext = {
      userId: "usr-owner-beta",
      email: "owner_beta@docuflow.id",
      role: "OWNER",
      ownerId: "owner-beta",
      ownerName: "Owner Beta",
      warehouseId: "wh-beta-01",
      warehouseName: "Gudang Utama Beta",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const prods = repo.getProductsByOwner(ctxBeta);
    const alphaProd = prods.find((p) => p.sku === "CBL-CAT6-001");
    assert.equal(alphaProd, undefined, "Owner Beta tidak boleh melihat produk milik Owner Alpha");

    const docs = repo.getCommercialDocuments(ctxBeta);
    const alphaDoc = docs.find((d) => d.ownerId === "owner-alpha");
    assert.equal(alphaDoc, undefined, "Owner Beta tidak boleh melihat dokumen milik Owner Alpha");
  });

  // -------------------------------------------------------------
  // Bagian 4: Pengikatan Dokumen Komersial ke Gudang (Warehouse Binding)
  // -------------------------------------------------------------

  await t.test("13. Dokumen komersial baru yang dibuat di Gudang SA-01 terikat pada warehouse_id SA-01", () => {
    const ctxSA01: ActiveSecurityContext = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      role: "SUPER_ADMIN",
      ownerId: "owner-super-admin",
      ownerName: "DocuFlow Internal Operations",
      warehouseId: "wh-sa-01",
      warehouseName: "Gudang SA-01",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const docInput: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: `INV-AUTO-SA01-${Date.now().toString().slice(-4)}`,
      documentDate: "2026-10-17",
      dueDate: "2026-10-31",
      customerId: "cust-sa-01",
      paymentStatus: "UNPAID",
      lines: [
        {
          productId: "prod-sa-01-a",
          quantity: 1,
          unitPrice: 150000,
        },
      ],
    };

    const created = repo.createCommercialDocument(ctxSA01, docInput);
    assert.equal(created.warehouseId, "wh-sa-01", "Dokumen harus terikat ke wh-sa-01");

    const inDb = db
      .prepare("SELECT warehouse_id FROM commercial_documents WHERE id = ?")
      .get(created.id) as { warehouse_id: string };
    assert.equal(inDb.warehouse_id, "wh-sa-01");
  });

  await t.test("14. Dokumen komersial baru yang dibuat di Gudang SA-02 terikat pada warehouse_id SA-02", () => {
    const ctxSA02: ActiveSecurityContext = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      role: "SUPER_ADMIN",
      ownerId: "owner-super-admin",
      ownerName: "DocuFlow Internal Operations",
      warehouseId: "wh-sa-02",
      warehouseName: "Gudang SA-02",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const docInput: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: `INV-AUTO-SA02-${Date.now().toString().slice(-4)}`,
      documentDate: "2026-10-17",
      dueDate: "2026-10-31",
      customerId: "cust-sa-01",
      paymentStatus: "UNPAID",
      lines: [
        {
          productId: "prod-sa-02-a",
          quantity: 1,
          unitPrice: 250000,
        },
      ],
    };

    const created = repo.createCommercialDocument(ctxSA02, docInput);
    assert.equal(created.warehouseId, "wh-sa-02", "Dokumen harus terikat ke wh-sa-02");

    const inDb = db
      .prepare("SELECT warehouse_id FROM commercial_documents WHERE id = ?")
      .get(created.id) as { warehouse_id: string };
    assert.equal(inDb.warehouse_id, "wh-sa-02");
  });

  await t.test("15. Filter daftar dokumen di SA-01 mengecualikan seluruh dokumen SA-02", () => {
    const ctxSA01: ActiveSecurityContext = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      role: "SUPER_ADMIN",
      ownerId: "owner-super-admin",
      ownerName: "DocuFlow Internal Operations",
      warehouseId: "wh-sa-01",
      warehouseName: "Gudang SA-01",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const docs = repo.getCommercialDocuments(ctxSA01);
    const hasSA02 = docs.some((d) => d.warehouseId === "wh-sa-02");
    assert.equal(hasSA02, false, "Daftar dokumen SA-01 tidak boleh memiliki dokumen dengan warehouse_id wh-sa-02");
  });

  await t.test("16. Query detail dokumen milik gudang lain ditolak atau dikembalikan null", () => {
    const ctxSA01: ActiveSecurityContext = {
      userId: "usr-super-admin",
      email: "admin@docuflow.id",
      role: "SUPER_ADMIN",
      ownerId: "owner-super-admin",
      ownerName: "DocuFlow Internal Operations",
      warehouseId: "wh-sa-01",
      warehouseName: "Gudang SA-01",
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // ID dokumen SA-02 yang ada di database
    const sa02Doc = db
      .prepare("SELECT id FROM commercial_documents WHERE warehouse_id = 'wh-sa-02' LIMIT 1")
      .get() as { id: string } | undefined;

    if (sa02Doc) {
      const fetched = repo.getCommercialDocumentById(ctxSA01, sa02Doc.id);
      assert.equal(
        fetched,
        null,
        "Mengambil dokumen gudang lain (SA-02) dari konteks SA-01 harus mengembalikan null (isolasi gudang)"
      );
    }
  });

  // -------------------------------------------------------------
  // Bagian 5: Kualitas & Keamanan Halaman Login (src/app/login/page.tsx)
  // -------------------------------------------------------------

  await t.test("17. Halaman login tidak lagi mengekspos panel 'Akun Pengujian Cepat'", () => {
    const loginFilePath = path.join(process.cwd(), "src/app/login/page.tsx");
    const content = fs.readFileSync(loginFilePath, "utf-8");

    assert.ok(
      !content.includes("Akun Pengujian Cepat"),
      "Panel 'Akun Pengujian Cepat' tidak boleh ada di halaman login publik"
    );
    assert.ok(
      !content.includes("klik untuk mengisi form otomatis"),
      "Teks prefill pengujian tidak boleh ada di halaman login publik"
    );
  });

  await t.test("18. Halaman login tidak merender password atau email demo secara hardcoded di UI", () => {
    const loginFilePath = path.join(process.cwd(), "src/app/login/page.tsx");
    const content = fs.readFileSync(loginFilePath, "utf-8");

    assert.ok(
      !content.includes("password123"),
      "Password demo tidak boleh tertulis dalam kode halaman login"
    );
    assert.ok(
      !content.includes("DOCUFLOW INVENTORY V2.4.1"),
      "Badge prototipe tidak boleh ada di halaman login production"
    );
  });

  await t.test("19. Halaman login memiliki toggle show/hide password, input accessible, dan autocomplete standar", () => {
    const loginFilePath = path.join(process.cwd(), "src/app/login/page.tsx");
    const content = fs.readFileSync(loginFilePath, "utf-8");

    assert.ok(
      content.includes("showPassword") && content.includes("togglePassword"),
      "Harus menyediakan toggle show/hide password yang aman"
    );
    assert.ok(
      content.includes('autoComplete="username"') || content.includes('autoComplete="email"'),
      "Input email harus mendukung autocomplete password manager"
    );
    assert.ok(
      content.includes('autoComplete="current-password"'),
      "Input password harus mendukung autocomplete current-password"
    );
  });

  await t.test("20. Kegagalan login menghasilkan pesan error generik untuk mencegah enumerasi akun pengguna", () => {
    const authActionsPath = path.join(process.cwd(), "src/lib/auth/actions.ts");
    const content = fs.readFileSync(authActionsPath, "utf-8");

    // Pesan kegagalan generik
    assert.ok(
      content.includes("Kredensial login tidak valid. Silakan periksa email dan password Anda."),
      "Pesan error harus generik dan seragam untuk kegagalan autentikasi"
    );
  });
});

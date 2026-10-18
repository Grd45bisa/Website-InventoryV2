import test from "node:test";
import assert from "node:assert/strict";
import {
  InventoryRepository,
  type CreateCommercialDocumentInput,
} from "../src/lib/db/repositories/inventory-repository.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const testContext: ActiveSecurityContext = {
  userId: "usr-owner-alpha",
  email: "owner_alpha@docuflow.id",
  role: "OWNER",
  ownerId: "owner-alpha",
  ownerName: "Owner Alpha",
  warehouseId: "wh-north",
  warehouseName: "Gudang Utara",
  isSuperAdminOnBehalf: false,
  grantId: null,
};

test("CUSTOMER MANAGEMENT, BENTO UI & CASHBACK POINTS INTEGRATION TEST", async (t) => {
  const repo = new InventoryRepository();

  await t.test("1. Membuat dokumen dengan Pelanggan Baru secara atomik", () => {
    const timestamp = Date.now();
    const docNumber = `INV-TEST-${timestamp.toString().slice(-6)}`;
    const newStoreName = `Toko Maju Baru ${timestamp.toString().slice(-4)}`;

    const createInput: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: docNumber,
      documentDate: "2026-10-16",
      dueDate: "2026-10-30",
      newCustomer: {
        name: newStoreName,
        ownerName: "Budi Santoso",
        picSales: "Sales Rian",
        phone: "08123456789",
        email: "budi@majubaru.com",
        address: "Jl. Sudirman No. 12",
      },
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 2,
          unitPrice: 50000,
          discountType: "NONE",
          discountValue: 0,
        },
      ],
      paymentStatus: "UNPAID",
      cashbackType: "PERCENTAGE",
      cashbackValue: 5, // 5% cashback
      cashbackAmount: 5000, // 5% dari 100.000 = 5.000 poin
    };

    const doc = repo.createCommercialDocument(testContext, createInput);

    assert.equal(doc.documentNumber, docNumber);
    assert.equal(doc.status, "ISSUED");
    assert.equal(doc.totalAmount, 100000);
    assert.equal(doc.customerName, newStoreName);

    // Verifikasi pelanggan tersimpan di master pelanggan dengan profil lengkap
    const customers = repo.getCustomers(testContext);
    const created = customers.find((c) => c.name === newStoreName);
    assert.ok(created, "Pelanggan baru harus tersimpan di tabel customers");
    assert.equal(created.ownerName, "Budi Santoso");
    assert.equal(created.picSales, "Sales Rian");
    assert.equal(created.phone, "08123456789");

    // Karena invoice UNPAID, poin masuk sebagai pending (0 available, 5000 pending)
    const points = repo.getCustomerPointBalance(testContext, created.id);
    assert.equal(points.availablePoints, 0, "Poin belum available sebelum lunas");
    assert.equal(points.pendingPoints, 5000, "Poin harus tercatat sebagai pending");
  });

  await t.test("2. Dua pelanggan dengan nama toko SAMA tetapi pemilik BERBEDA memiliki ID unik dan saldo terpisah", () => {
    const timestamp = Date.now();
    const storeName = `Toko Sumber Rezeki ${timestamp.toString().slice(-4)}`;

    // Buat Toko 1 dengan Pemilik Budi
    const doc1Input: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: `INV-A-${timestamp.toString().slice(-5)}`,
      documentDate: "2026-10-16",
      dueDate: "2026-10-30",
      newCustomer: {
        name: storeName,
        ownerName: "Budi Setiawan",
        phone: "0811111111",
      },
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 1,
          unitPrice: 100000,
        },
      ],
      paymentStatus: "PAID", // Langsung lunas
      cashbackType: "NOMINAL",
      cashbackValue: 10000,
      cashbackAmount: 10000,
    };
    const doc1 = repo.createCommercialDocument(testContext, doc1Input);

    // Buat Toko 2 dengan Nama Toko yang SAMA persis tetapi Pemilik Andi
    const doc2Input: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: `INV-B-${timestamp.toString().slice(-5)}`,
      documentDate: "2026-10-16",
      dueDate: "2026-10-30",
      newCustomer: {
        name: storeName,
        ownerName: "Andi Wijaya",
        phone: "0822222222",
      },
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 1,
          unitPrice: 50000,
        },
      ],
      paymentStatus: "PAID", // Langsung lunas
      cashbackType: "NOMINAL",
      cashbackValue: 3000,
      cashbackAmount: 3000,
    };
    const doc2 = repo.createCommercialDocument(testContext, doc2Input);

    // Kedua customer harus memiliki ID unik yang berbeda
    assert.notEqual(doc1.customerId, doc2.customerId, "Customer ID harus berbeda meski nama toko sama");

    // Saldo poin masing-masing tidak boleh tercampur
    const pts1 = repo.getCustomerPointBalance(testContext, doc1.customerId);
    const pts2 = repo.getCustomerPointBalance(testContext, doc2.customerId);

    assert.equal(pts1.availablePoints, 10000, "Toko Pemilik Budi harus memiliki 10.000 poin");
    assert.equal(pts2.availablePoints, 3000, "Toko Pemilik Andi harus memiliki 3.000 poin");
  });

  await t.test("3. Poin pending diaktifkan menjadi available saat invoice dilunasi", () => {
    const timestamp = Date.now();
    const docNumber = `INV-PEND-${timestamp.toString().slice(-6)}`;
    const storeName = `Toko Pending Test ${timestamp.toString().slice(-4)}`;

    const docInput: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: docNumber,
      documentDate: "2026-10-16",
      dueDate: "2026-10-30",
      newCustomer: {
        name: storeName,
      },
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 1,
          unitPrice: 200000,
        },
      ],
      paymentStatus: "UNPAID",
      cashbackType: "PERCENTAGE",
      cashbackValue: 10,
      cashbackAmount: 20000, // 20.000 poin
    };
    const doc = repo.createCommercialDocument(testContext, docInput);

    // Sebelum pembayaran: 0 available, 20.000 pending
    let pts = repo.getCustomerPointBalance(testContext, doc.customerId);
    assert.equal(pts.availablePoints, 0);
    assert.equal(pts.pendingPoints, 20000);

    // Lakukan pelunasan invoice
    repo.recordDocumentPayment(testContext, {
      documentId: doc.id,
      amount: 200000,
      paymentMethod: "TRANSFER",
      referenceNumber: `TRF-${timestamp.toString().slice(-6)}`,
    });

    // Setelah lunas: 20.000 available, 0 pending
    pts = repo.getCustomerPointBalance(testContext, doc.customerId);
    assert.equal(pts.availablePoints, 20000, "Poin harus berpindah menjadi available setelah lunas");
    assert.equal(pts.pendingPoints, 0, "Poin pending harus 0 setelah lunas");
  });

  await t.test("4. Penukaran poin memotong total tagihan dan divalidasi tidak boleh melebihi saldo", () => {
    // Ambil customer yang sudah punya poin dari test sebelumnya
    const customers = repo.getCustomers(testContext);
    const custWithPoints = customers.find((c) => c.availablePoints >= 10000);
    assert.ok(custWithPoints, "Harus ada customer dengan minimal 10.000 poin");

    const initialPoints = custWithPoints.availablePoints;

    // A. Coba redeem melebihi saldo -> Harus Ditolak
    assert.throws(
      () => {
        const invalidInput: CreateCommercialDocumentInput = {
          documentType: "INVOICE",
          documentNumber: `INV-FAIL-${Date.now().toString().slice(-5)}`,
          documentDate: "2026-10-16",
          dueDate: "2026-10-30",
          customerId: custWithPoints.id,
          lines: [{ productId: "prod-cbl-01", quantity: 1, unitPrice: 100000 }],
          pointsRedeemed: initialPoints + 5000, // Lebih dari saldo
        };
        repo.createCommercialDocument(testContext, invalidInput);
      },
      /melebihi saldo poin/i,
      "Harus menolak penukaran poin jika melebihi saldo"
    );

    // B. Redeem sejumlah yang sah (misal 5000 poin = Rp 5.000 potongan)
    const validInput: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: `INV-REDEEM-${Date.now().toString().slice(-5)}`,
      documentDate: "2026-10-16",
      dueDate: "2026-10-30",
      customerId: custWithPoints.id,
      lines: [{ productId: "prod-cbl-01", quantity: 1, unitPrice: 100000 }],
      pointsRedeemed: 5000,
    };
    const validDoc = repo.createCommercialDocument(testContext, validInput);

    // Tagihan 100.000 dipotong poin 5.000 = 95.000
    assert.equal(validDoc.totalAmount, 95000);
    assert.equal(validDoc.pointsRedeemed, 5000);

    // Saldo poin berkurang sebanyak 5.000
    const remaining = repo.getCustomerPointBalance(testContext, custWithPoints.id);
    assert.equal(remaining.availablePoints, initialPoints - 5000, "Saldo poin harus berkurang setelah diredeem");
  });
});

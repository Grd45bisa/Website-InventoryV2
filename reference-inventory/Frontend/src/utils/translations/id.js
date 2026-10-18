import { auth } from './id/auth.js';
import { nav } from './id/nav.js';
import { sidebar } from './id/sidebar.js';
import { general } from './id/general.js';
import { products } from './id/products.js';
import { goodsIn } from './id/goodsIn.js';
import { goodsOut } from './id/goodsOut.js';
import { productDetail } from './id/productDetail.js';
import { reports } from './id/reports.js';
import { activity } from './id/activity.js';
import { customers } from './id/customers.js';
import { suppliers } from './id/suppliers.js';
import { documents } from './id/documents.js';
import { settings } from './id/settings.js';
import { auditLog } from './id/auditLog.js';
import { purchaseOrders } from './id/purchaseOrders.js';

export const id = {
  ...auth,
  ...nav,
  ...sidebar,
  ...general,
  ...products,
  ...goodsIn,
  ...goodsOut,
  ...productDetail,
  ...reports,
  ...activity,
  ...customers,
  ...suppliers,
  ...documents,
  ...settings,
  ...auditLog,
  ...purchaseOrders,
};


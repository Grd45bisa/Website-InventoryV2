import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/dev.db");
console.log("=== USERS ===");
console.log(db.prepare("SELECT id, email, full_name, is_super_admin FROM users").all());

console.log("=== SESSIONS ===");
console.log(db.prepare("SELECT id, user_id, active_owner_id, active_warehouse_id, expires_at FROM auth_sessions").all());

console.log("=== MEMBERSHIPS ===");
console.log(db.prepare("SELECT id, user_id, owner_id, role, status FROM owner_memberships").all());

console.log("=== ASSIGNMENTS ===");
console.log(db.prepare("SELECT id, user_id, owner_id, warehouse_id, status FROM warehouse_assignments").all());

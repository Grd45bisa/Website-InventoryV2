import { getDatabaseClient } from "../src/lib/db/sqlite-client.ts";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";

const db = getDatabaseClient();
const applied = runMigrations(db);
console.log("Migrations applied:", applied);
const seeded = seedSyntheticData(db);
console.log("Seed result:", seeded);

import { getDatabase, migrate } from "../lib/db/database.mjs";

const db = getDatabase();
const result = migrate(db);
const tables = db
  .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .map((row) => row.name)
  .filter((name) => name !== "sqlite_sequence");

console.log(`Schema version ${result.schemaVersion} applied.`);
console.log(`Tables: ${tables.join(", ")}`);

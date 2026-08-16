import Database from "better-sqlite3";
import path from "path";

// Database file lives next to the project root
const DB_PATH = path.join(__dirname, "..", "orders.db");

// Create or open the SQLite database
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

/**
 * Create the orders table if it doesn't exist.
 * This runs once at startup.
 */
export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id       TEXT PRIMARY KEY,
      customer_name  TEXT NOT NULL,
      item           TEXT NOT NULL,
      qty            INTEGER NOT NULL,
      amount         REAL,
      status         TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'shipped', 'delivered')),
      delivery_date  TEXT,
      ordered_at     TEXT NOT NULL,
      notes          TEXT
    )
  `);
  console.log("✅ Database initialized");
}

/**
 * Insert or replace an order into the database.
 * Used by both CSV loader and webhook endpoint.
 */
export function upsertOrder(order: {
  order_id: string;
  customer_name: string;
  item: string;
  qty: number;
  amount: number | null;
  status: string;
  delivery_date: string | null;
  ordered_at: string;
  notes: string | null;
}): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO orders 
      (order_id, customer_name, item, qty, amount, status, delivery_date, ordered_at, notes)
    VALUES 
      (@order_id, @customer_name, @item, @qty, @amount, @status, @delivery_date, @ordered_at, @notes)
  `);
  stmt.run(order);
}

/**
 * Run a SELECT query and return the rows.
 * Only SELECT queries are allowed — this is a safety measure.
 */
export function runQuery(sql: string): { rows: Record<string, unknown>[]; error: string | null } {
  try {
    // Safety: only allow SELECT statements
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith("SELECT")) {
      return { rows: [], error: "Only SELECT queries are allowed." };
    }

    const rows = db.prepare(sql).all() as Record<string, unknown>[];
    return { rows, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    return { rows: [], error: message };
  }
}

/**
 * Get a summary of the data for context (used in LLM prompts).
 */
export function getTableInfo(): string {
  const count = db.prepare("SELECT COUNT(*) as total FROM orders").get() as { total: number };
  const customers = db.prepare("SELECT DISTINCT customer_name FROM orders ORDER BY customer_name").all() as { customer_name: string }[];
  const statuses = db.prepare("SELECT DISTINCT status FROM orders").all() as { status: string }[];

  return `The orders table has ${count.total} rows.
Columns: order_id (TEXT, primary key), customer_name (TEXT), item (TEXT), qty (INTEGER), amount (REAL, in USD), status (TEXT: ${statuses.map(s => s.status).join("/")}), delivery_date (TEXT, nullable), ordered_at (TEXT, timestamp), notes (TEXT, nullable).
Customers in the database: ${customers.map(c => c.customer_name).join(", ")}.
Note: Some orders have amount = 0.00 (quote pending). Some names like "Ram" match multiple customers (Ram Patel, Ram Sharma).`;
}

export { db };

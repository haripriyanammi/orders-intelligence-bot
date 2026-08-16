import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { initDatabase, upsertOrder } from "./database";

/**
 * Load orders.csv into the SQLite database.
 * Run this once before starting the bot: npm run load-data
 */
function loadCsv(): void {
  // 1) Initialize the table
  initDatabase();

  // 2) Read the CSV file
  const csvPath = path.join(__dirname, "..", "data", "orders.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("❌ orders.csv not found at", csvPath);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, "utf-8");

  // 3) Parse CSV into rows
  const records = parse(fileContent, {
    columns: true,        // use first row as column names
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  // 4) Insert each row into the database
  let loaded = 0;
  for (const row of records) {
    upsertOrder({
      order_id: row.order_id,
      customer_name: row.customer_name,
      item: row.item,
      qty: parseInt(row.qty, 10),
      amount: row.amount ? parseFloat(row.amount) : null,
      status: row.status,
      delivery_date: row.delivery_date || null,
      ordered_at: row.ordered_at,
      notes: row.notes || null,
    });
    loaded++;
  }

  console.log(`✅ Loaded ${loaded} orders into the database`);
}

loadCsv();

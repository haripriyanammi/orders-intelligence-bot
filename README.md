# Orders Intelligence Bot

A Discord bot that takes natural language questions about customer orders and answers them using data from a SQLite database. You can ask like "How much has Jordan spent?" and it'll query the database and reply in plain English.

## How It Works

The bot uses a two step approach with Google's Gemini LLM:

1. User types a question in Discord
2. The bot sends the question + the database schema to Gemini
3. Gemini figures out what SQL query to run or if it's not an order related question just replies normally
4. The bot runs the SQL against SQLite and gets the results
5. Those results go back to Gemini, which writes a human friendly answer
6. The bot posts that answer back in Discord

There's also an Express server running alongside the bot with a webhook endpoint (`POST /webhook/orders`) so external systems can push new orders into the database. Once an order is added through the webhook, it immediately shows up when you ask about it in Discord.

## Tech Stack

- Node.js + TypeScript (runs with ts-node, no build step needed)
- discord.js for the Discord connection
- better-sqlite3 for the database
- Google Gemini 3.5-flash-lite for the LLM calls
- Express for the webhook server

## String of the code

Needed Node.js v18+, a Discord bot token, and a Gemini API key.

```bash
git clone https://github.com/haripriyanammi/orders-intelligence-bot.git
cd orders-intelligence-bot
npm install
```

Copy the example env file and added keys:

```bash
cp .env.example .env
```

Then open `.env` and fill in:
```
DISCORD_BOT_TOKEN=your_token_here
GEMINI_API_KEY=your_key_here
PORT=3000
```

Load the CSV data into the database:

```bash
npx ts-node src/loadCsv.ts
```

Start the bot:

```bash
npx ts-node src/index.ts
```

You should see three green checkmarks — database ready, webhook server running, and Discord bot logged in. Now go to your Discord server and try asking something.

## Webhook

You can also add orders through the webhook. Here's an example with curl:

```bash
curl -X POST http://localhost:3000/webhook/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORD-021",
    "customer_name": "Priya Sharma",
    "item": "Wireless Mouse",
    "qty": 2,
    "amount": 45.99,
    "status": "pending"
  }'
```
Can also check throgh postman by using POST METHOD 

There's also a health check at `GET /health` that tells you if the bot is connected.

## How I Handled Edge Cases

- **Two customers named Ram:** The data has both Ram Patel and Ram Sharma. When someone asks about "Ram", the bot finds both and lists their orders separately so there's no confusion.
- **$0.00 amount (ORD-011):** This order has a note saying "Quote pending approval", so the bot flags it as amount pending instead of reporting zero spend.
- **Missing delivery dates:** Some orders don't have a delivery date yet (pending/processing ones). The bot shows these as "not yet scheduled" instead of showing null.
- **SQL injection:** The bot only allows SELECT queries — anything else gets rejected before it reaches the database.

## Design Decisions

- **Why SQLite:** For 20 rows running locally, there's no need for a full Postgres/MySQL setup. SQLite is just a file, zero config. The SQL is standard enough that switching to Postgres later would mostly just mean changing the driver.
- **Why two LLM calls:** One call to understand the question and generate SQL, another to take the raw data and write a readable answer. I kept them separate so each step can be tested and debugged on its own.
- **Why Gemini Flash Lite:** The free tier on Flash was hitting 503 rate limits during peak hours. Flash Lite handles text-to-SQL and result formatting just as well for this use case, with better availability and lower latency.
- **Bot + webhook in one process:** Kept it simple for now. In production I'd split them into separate services.

## Things I'd Add With More Time

- **Conversation memory** — right now every question is independent. It would be nice if the bot could handle follow-ups like "What about their latest order?" without repeating the customer name.
- **Query caching** — if someone asks "show all pending orders" five times, it hits the LLM every time. A short TTL cache would save API calls.
- **Access control** — in a real team, not everyone should see all order data. Could tie Discord roles to database-level filtering.

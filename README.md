# Orders Intelligence Bot

A Discord bot that answers natural-language questions about customer orders. It listens in a team chat channel, understands queries like *"What is Ram's order status?"*, fetches the relevant data from a SQLite database, and posts a clear plain-English answer back — no SQL required.

## Architecture

```
User types question in Discord
        │
        ▼
Discord Gateway (WebSocket)
        │
        ▼
Bot receives message
        │
        ▼
Gemini LLM classifies the message:
  ├─ Not about orders → reply with friendly message
  └─ About orders → generates a SQL query
        │
        ▼
SQLite database executes the query
        │
        ▼
Results sent back to Gemini LLM
        │
        ▼
Gemini composes a plain-English answer
        │
        ▼
Bot posts the answer in the Discord channel
```

A separate Express server runs alongside the bot, exposing a webhook endpoint (`POST /webhook/orders`) that accepts new orders from external systems and inserts them into the database in real time.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Chat Platform:** Discord (via discord.js)
- **Database:** SQLite (via better-sqlite3)
- **LLM:** Google Gemini 2.0 Flash (via @google/generative-ai)
- **Webhook Server:** Express

## Prerequisites

- Node.js v18 or higher
- A Discord account and bot token ([Developer Portal](https://discord.com/developers/applications))
- A Google Gemini API key ([AI Studio](https://aistudio.google.com/api-keys))

## Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone <repo-url>
   cd orders-intelligence-bot
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your keys:
   ```
   DISCORD_BOT_TOKEN=your_discord_bot_token
   GEMINI_API_KEY=your_gemini_api_key
   PORT=3000
   ```

3. **Load the CSV data into the database:**
   ```bash
   npx ts-node src/loadCsv.ts
   ```
   This creates `orders.db` with all 20 orders from the CSV.

4. **Start the bot:**
   ```bash
   npx ts-node src/index.ts
   ```
   You should see:
   ```
   ✅ Database initialized
   ✅ Webhook server running on http://localhost:3000
   ✅ Discord bot logged in as Orders Intelligence Bot#1234
   ```

5. **Test it:** Go to your Discord server and type a question in the `#general` channel:
   - "What is Ram's order status?"
   - "How much has Jordan spent?"
   - "Show me all pending orders"
   - "What is the most expensive order?"

## Webhook API

New orders can be sent to the system via the webhook endpoint:

```bash
curl -X POST http://localhost:3000/webhook/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORD-021",
    "customer_name": "New Customer",
    "item": "Wireless Keyboard",
    "qty": 1,
    "amount": 59.99,
    "status": "pending",
    "ordered_at": "2024-01-25 10:00",
    "notes": "Express shipping"
  }'
```

A health check is available at `GET /health`.

## Data Quality Handling

The system handles dirty data gracefully:

- **$0.00 amounts** (e.g., ORD-011): The LLM is instructed to flag these as "amount pending" rather than reporting zero spend.
- **Ambiguous names** (e.g., "Ram" matches Ram Patel and Ram Sharma): The query uses LIKE wildcards, and the LLM clearly separates results by customer so there is no confusion.
- **Missing delivery dates**: Shown as "not yet scheduled" instead of null.
- **SQL injection prevention**: Only SELECT queries are executed; any non-SELECT statement is rejected.

## Design Decisions

- **SQLite over PostgreSQL/MySQL:** For a 20-row dataset running locally, SQLite removes all setup friction — no server process, no credentials, just a file. The same SQL queries would work with a production database by swapping the driver.
- **Two-step LLM flow:** The first LLM call classifies the message and generates SQL; the second takes the database results and composes the English reply. This separation means the SQL generation can be tested independently from the response formatting.
- **Webhook + Bot in one process:** Both the Express webhook server and the Discord bot run in a single Node.js process for simplicity. In production, these would be separate services behind a load balancer.
- **LIKE wildcards for name search:** Partial name matching (`%Ram%`) ensures that a user typing just a first name still finds the right orders, even when multiple customers share that name.

## What I'd Improve With More Time

1. **Conversation memory:** Store recent exchanges per channel so the bot can handle follow-up questions like "What about their latest order?" without the user repeating the customer name.
2. **Caching frequent queries:** Popular questions ("show all pending orders") hit the LLM every time. A short-lived cache keyed on normalized question text would save API calls and respond faster.
3. **Role-based access control:** In a real team, not everyone should see all order data. Integrate Discord roles with database-level row filtering so users only see orders they're authorized to view.

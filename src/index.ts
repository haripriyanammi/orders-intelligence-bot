import dotenv from "dotenv";
dotenv.config(); 

import { Client, GatewayIntentBits, Events } from "discord.js";
import express from "express";
import { initDatabase, upsertOrder, runQuery } from "./database";
import { classifyAndGenerateSQL, composeAnswer } from "./llm";

//1) Init
initDatabase();

//bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           
    GatewayIntentBits.GuildMessages,     
    GatewayIntentBits.MessageContent,    
  ],
});

// When the bot is connected
client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Discord bot logged in as ${readyClient.user.tag}`);
});

// When a message is sent in any channel the bot can see
client.on(Events.MessageCreate, async (message) => {
  
  if (message.author.bot) return;

  const userMessage = message.content.trim();
  if (!userMessage) return;

  try {
    // Show "typing..." indicator while processing
    await message.channel.sendTyping();

    // Step 1: Classify the message and generate SQL if needed
    const classification = await classifyAndGenerateSQL(userMessage);

    if (classification.type === "not_order") {
      // Not an order question — send a friendly reply
      await message.reply(classification.reply);
      return;
    }

    // Step 2: Run the SQL query against the database
    const { rows, error } = runQuery(classification.sql);

    if (error) {
      console.error("Database error:", error);
      await message.reply(
        "I had trouble looking that up. Could you rephrase your question?"
      );
      return;
    }

    // Step 3: Send the results to the LLM and compose a plain-English answer
    const answer = await composeAnswer(userMessage, rows, classification.sql);

    // Step 4: Post the answer back to the channel
    // Discord has a 2000 character limit per message
    if (answer.length > 2000) {
      // Split into chunks if too long
      for (let i = 0; i < answer.length; i += 2000) {
        await message.reply(answer.slice(i, i + 2000));
      }
    } else {
      await message.reply(answer);
    }
  } catch (err) {
    console.error("Error processing message:", err);
    await message.reply(
      "Sorry, something went wrong while processing your question. Please try again."
    );
  }
});


const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN is missing in .env");
  process.exit(1);
}
client.login(DISCORD_TOKEN);//ready for websocket connection

//for webhook
const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    bot: client.isReady() ? "connected" : "connecting",
  });
});


app.post("/webhook/orders", (req, res) => {
  try {
    const order = req.body;

    
    if (!order.order_id || !order.customer_name || !order.item) {
      return res.status(400).json({
        error: "Missing required fields: order_id, customer_name, item",
      });
    }

    // Insert 
    upsertOrder({
      order_id: order.order_id,
      customer_name: order.customer_name,
      item: order.item,
      qty: Number(order.qty) || 1,
      amount: order.amount != null ? Number(order.amount) : null,
      status: order.status || "pending",
      delivery_date: order.delivery_date || null,
      ordered_at: order.ordered_at || new Date().toISOString(),
      notes: order.notes || null,
    });

    console.log(`📦 Received order via webhook: ${order.order_id}`);
    return res.status(201).json({ message: "Order received", order_id: order.order_id });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Failed to process order" });
  }
});


const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`✅ Webhook server running on http://localhost:${PORT}`);
  console.log(`   POST /webhook/orders  — receive new orders`);
  console.log(`   GET  /health          — health check`);
});

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getTableInfo } from "./database";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");//only to get gemini client and config
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });/**
 * Step 1: Classify the message and generate SQL if it's about orders.
 *
 * Returns either:
 *   { type: "query", sql: "SELECT ..." }
 *   { type: "not_order", reply: "friendly message" }
 */
export async function classifyAndGenerateSQL(
  userMessage: string
): Promise<{ type: "query"; sql: string } | { type: "not_order"; reply: string }> {
  const tableInfo = getTableInfo();
//prompt given to gemini
  const prompt = `You are a helpful assistant that works with a customer orders database.

DATABASE SCHEMA:
${tableInfo}

USER MESSAGE: "${userMessage}"

YOUR TASK:
1. Decide if this message is asking about customer orders, order status, spending, deliveries, or anything related to the orders database.
2. If YES — generate a SQLite-compatible SELECT query to answer the question. Handle name matching with LIKE and '%' wildcards for partial matches (e.g., WHERE customer_name LIKE '%Ram%'). Return ONLY the SQL in this exact format:
   QUERY: SELECT ...
3. If NO — the message is just a greeting or unrelated chat. Return a short friendly reply in this format:
   REPLY: your friendly message here

IMPORTANT RULES:
- Only generate SELECT queries. Never INSERT, UPDATE, DELETE, or DROP.
- Use LIKE with wildcards for name searches so partial names work.
- If a name could match multiple customers, return ALL matching customers so we can show the user.
- For "most recent" or "latest" questions, use ORDER BY ordered_at DESC LIMIT 1.
- For total spend questions, use SUM(amount) and GROUP BY customer_name.
- Always include customer_name in results so the user knows whose data they're seeing.

Respond with ONLY "QUERY: ..." or "REPLY: ..." — nothing else.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  if (text.startsWith("QUERY:")) {
    const sql = text.replace("QUERY:", "").trim();
    return { type: "query", sql };
  } else if (text.startsWith("REPLY:")) {
    const reply = text.replace("REPLY:", "").trim();
    return { type: "not_order", reply };
  }

  // Fallback: treat as not order-related
  return { type: "not_order", reply: "I'm here to help with order questions! Try asking something like: \"What is Ram's order status?\"" };
}

/**
 * Step 2: Take database results and compose a plain-English answer.
 */
export async function composeAnswer(
  userMessage: string,
  rows: Record<string, unknown>[],
  sql: string
): Promise<string> {
  // Handle empty results
  if (rows.length === 0) {
    return "I couldn't find any orders matching your question. Please check the customer name or try rephrasing.";
  }

  // Check for ambiguity — multiple different customers
  const uniqueCustomers = [...new Set(rows.map((r) => r.customer_name as string))];

  const prompt = `You are a friendly order assistant in a team chat. A user asked a question and here are the database results.

USER QUESTION: "${userMessage}"

SQL QUERY USED: ${sql}//

DATABASE RESULTS (${rows.length} row${rows.length > 1 ? "s" : ""}):
${JSON.stringify(rows, null, 2)}

${uniqueCustomers.length > 1 ? `⚠️ IMPORTANT: The results contain orders from MULTIPLE different customers: ${uniqueCustomers.join(", ")}. Make sure to clearly separate and label each customer's orders so there is no confusion.` : ""}

YOUR TASK:
Compose a clear, helpful plain-English response. Follow these rules:
- Be conversational and friendly, like a helpful colleague
- Present the data clearly — use bullet points or short lists for multiple orders
- If there are multiple customers with similar names, clearly state this so the user can clarify
- If any order has amount = $0.00, mention that the amount appears to be pending or not yet set
- Include relevant details: order ID, item, quantity, amount, status, delivery date (if available), and any notes
- If delivery_date is null, say "not yet scheduled" rather than showing null
- Keep it concise — don't repeat the question back, just answer it
- Do NOT include any SQL or technical details in the response

Respond with ONLY the message to post in the chat.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

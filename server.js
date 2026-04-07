import express from "express";
import twilio from "twilio";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sessions = {};

const SYSTEM = `את/ה ג'ובי - בוט AI חכם וחם לחיפוש עבודה. תמיד עונה בעברית בצורה ידידותית ומעודדת.

## שלב א - ריאיון (שאלה אחת בכל פעם)
אסוף בשיחה טבעית:
1. שם + פרטי קשר
2. תפקיד/תחום מבוקש
3. שנות ניסיון + מיומנויות
4. מיקומים (ערים/מדינות)
5. סוג עבודה (פיזי/היברידי/מרחוק)
6. ציפיות שכר (אופציונלי)

## שלב ב - חיפוש
אחרי 4-5 שאלות כתוב: "מעולה! מתחיל/ת לחפש עבורך ברחבי הרשת... 🔍"
חפש ב: LinkedIn, Indeed, Glassdoor, AllJobs, Drushim, דפי קריירה.

## שלב ג - תוצאות
הצג עד 5 משרות בפורמט:

🎯 *[אחוז]% התאמה*
💼 *[תפקיד]* ב-[חברה]
📍 [מיקום] | [סוג משרה]
💰 [שכר אם ידוע]
📝 [תיאור קצר]
🔗 [URL]
---

## שלב ד - מכתב מקדים
אם המשתמש מבקש, כתוב מכתב מקדים מותאם אישית לכל משרה.
שאל: "לאיזו משרה תרצה/י מכתב מקדים?"`;

async function callClaude(userId, userMessage) {
  if (!sessions[userId]) {
    sessions[userId] = [];
  }

  sessions[userId].push({ role: "user", content: userMessage });

  // Keep last 20 messages to save tokens
  if (sessions[userId].length > 20) {
    sessions[userId] = sessions[userId].slice(-20);
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM,
      messages: sessions[userId],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });

    // Handle tool use (web search)
    if (response.stop_reason === "tool_use") {
      const toolResults = response.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ type: "tool_result", tool_use_id: b.id, content: "Search completed" }));

      sessions[userId].push({ role: "assistant", content: response.content });
      sessions[userId].push({ role: "user", content: toolResults });

      const finalResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM,
        messages: sessions[userId],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });

      const text = finalResponse.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      sessions[userId].push({ role: "assistant", content: finalResponse.content });
      return text;
    }

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    sessions[userId].push({ role: "assistant", content: response.content });
    return text;
  } catch (error) {
    console.error("Anthropic error:", error);
    return "מצטער/ת, הייתה שגיאה זמנית. נסה/י שוב 😅";
  }
}

// Health check
app.get("/", (req, res) => {
  res.send("Jovi WhatsApp Bot is running! 🤖");
});

// WhatsApp webhook
app.post("/whatsapp", async (req, res) => {
  const { From, Body } = req.body;
  const userId = From;

  console.log(`Message from ${userId}: ${Body}`);

  try {
    const reply = await callClaude(userId, Body || "שלום");
    
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    
    res.type("text/xml").send(twiml.toString());
  } catch (error) {
    console.error("Webhook error:", error);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("שגיאה זמנית, נסה שוב בעוד רגע 😅");
    res.type("text/xml").send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Jovi bot running on port ${PORT} 🚀`);
});

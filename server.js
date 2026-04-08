import express from "express";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessions = {};

// ── FREE AI: Groq (llama-3.3-70b) ──────────────────────
async function askGroq(messages) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              },
              body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        max_tokens: 1024,
                        messages,
              }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "שגיאה זמנית, נסה שוב.";
}

// ── FREE JOB SEARCH: Adzuna API ──────────────────────────
async function searchJobs(role, location = "israel") {
      const appId = process.env.ADZUNA_APP_ID;
      const appKey = process.env.ADZUNA_APP_KEY;
      const country = location.toLowerCase().includes("israel") ? "il" : "us";
      const query = encodeURIComponent(role);
      const loc = encodeURIComponent(location);

  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=5&what=${query}&where=${loc}&content-type=application/json`;

  try {
          const res = await fetch(url);
          const data = await res.json();
          return data.results || [];
  } catch {
          return [];
  }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────
const SYSTEM = `אתה ג'ובי - עוזר חיפוש עבודה חכם ואנושי בעברית. 
תפקידך: לשוחח בצורה חמה וידידותית, לאסוף פרטים ולאחר מכן לחפש משרות אמיתיות.

## שלב 1 - ריאיון (שאלה אחת בכל פעם):
1. מה התפקיד/תחום שאתה מחפש?
2. באיזה עיר/מדינה? (ברירת מחדל: ישראל)
3. כמה שנות ניסיון?
4. העדפות נוספות? (מרחוק/היברידי/פיזי, שכר)

## שלב 2 - כשיש מספיק מידע:
כתוב בדיוק: [SEARCH:תפקיד:מיקום]
לדוגמה: [SEARCH:software engineer:tel aviv]

## שלב 3 - הצגת משרות:
לאחר קבלת תוצאות, הצג בפורמט יפה עם אימוג'ים.
אם אין תוצאות, הצע לנסות תפקיד אחר.`;

// ── CONVERSATION HANDLER ──────────────────────────────────
async function handleMessage(userId, userMessage) {
      if (!sessions[userId]) {
              sessions[userId] = { history: [], state: "interview", profile: {} };
      }

  const session = sessions[userId];
      session.history.push({ role: "user", content: userMessage });

  // Keep last 16 messages
  if (session.history.length > 16) session.history = session.history.slice(-16);

  // Get AI response
  const aiReply = await askGroq([
      { role: "system", content: SYSTEM },
          ...session.history,
        ]);

  // Check if AI wants to search
  const searchMatch = aiReply.match(/\[SEARCH:([^:]+):([^\]]+)\]/);
      if (searchMatch) {
              const role = searchMatch[1].trim();
              const location = searchMatch[2].trim();

        // Do real job search!
        const jobs = await searchJobs(role, location);

        let reply;
              if (jobs.length === 0) {
                        reply = `לא מצאתי משרות ל-"${role}" ב-${location}. רוצה שאחפש בתפקיד דומה או מיקום אחר?`;
              } else {
                        reply = `🎯 *מצאתי ${jobs.length} משרות עבורך!*\n\n`;
                        jobs.slice(0, 4).forEach((job, i) => {
                                    const salary = job.salary_min
                                      ? `💰 ${Math.round(job.salary_min / 12).toLocaleString()}₪/חודש`
                                                  : "";
                                    reply += `*${i + 1}. ${job.title}*\n`;
                                    reply += `🏢 ${job.company?.display_name || "חברה לא ידועה"}\n`;
                                    reply += `📍 ${job.location?.display_name || location}\n`;
                                    if (salary) reply += `${salary}\n`;
                                    reply += `🔗 ${job.redirect_url}\n\n`;
                        });
                        reply += `רוצה שאשלח קורות חיים לאחת מהמשרות האלה?`;
              }

        session.history.push({ role: "assistant", content: reply });
              return reply;
      }

  session.history.push({ role: "assistant", content: aiReply });
      return aiReply;
}

// ── ROUTES ────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Jovi Bot 🤖 - FULL VERSION - Running!"));

app.post("/whatsapp", async (req, res) => {
      const { From, Body } = req.body;
      console.log(`[${new Date().toISOString()}] ${From}: ${Body}`);

           try {
                   const reply = await handleMessage(From, Body || "שלום");
                   const twiml = new twilio.twiml.MessagingResponse();
                   // WhatsApp has 1600 char limit
        twiml.message(reply.slice(0, 1580));
                   res.type("text/xml").send(twiml.toString());
           } catch (err) {
                   console.error(err);
                   const twiml = new twilio.twiml.MessagingResponse();
                   twiml.message("שגיאה זמנית 😅 נסה שוב.");
                   res.type("text/xml").send(twiml.toString());
           }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Jovi FULL bot running on port ${PORT} 🚀`));

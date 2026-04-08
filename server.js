import express from "express";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session storage
const sessions = {};

// ── GROQ AI ───────────────────────────────────────────────
async function askGroq(messages) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                  },
                  body: JSON.stringify({
                              model: "llama-3.3-70b-versatile",
                              max_tokens: 800,
                              temperature: 0.3,
                              messages,
                  }),
        });
        const data = await res.json();
        console.log("Groq response:", JSON.stringify(data).slice(0, 300));
        return data.choices?.[0]?.message?.content || "שגיאה זמנית.";
}

// ── ADZUNA JOB SEARCH ────────────────────────────────────
// Supported: gb, us, au, ca, de, fr, nl, in, it, pl, nz, br, sg, za, at, ru
function getCountryCode(location) {
        const loc = location.toLowerCase();
        if (loc.includes("israel") || loc.includes("ישראל") || loc.includes("תל אביב") || loc.includes("tel aviv") || loc.includes("jerusalem") || loc.includes("haifa")) return "gb"; // fallback to UK for IL
  if (loc.includes("usa") || loc.includes("united states") || loc.includes("new york") || loc.includes("san francisco")) return "us";
        if (loc.includes("uk") || loc.includes("london") || loc.includes("england")) return "gb";
        if (loc.includes("germany") || loc.includes("berlin")) return "de";
        if (loc.includes("france") || loc.includes("paris")) return "fr";
        if (loc.includes("canada") || loc.includes("toronto")) return "ca";
        if (loc.includes("australia") || loc.includes("sydney")) return "au";
        return "gb"; // default fallback
}

async function searchJobs(role, location) {
        const appId = process.env.ADZUNA_APP_ID;
        const appKey = process.env.ADZUNA_APP_KEY;
        const country = getCountryCode(location);
        const query = encodeURIComponent(role);

  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=5&what=${query}&content-type=application/json`;

  console.log("Searching Adzuna:", url);

  try {
            const res = await fetch(url);
            const data = await res.json();
            console.log("Adzuna result count:", data.results?.length, "total:", data.count);
            return data.results || [];
  } catch (err) {
            console.error("Adzuna error:", err.message);
            return [];
  }
}

// ── CONVERSATION STATE MACHINE ────────────────────────────
async function handleMessage(userId, userMessage) {
        if (!sessions[userId]) {
                  sessions[userId] = { step: 0, role: "", location: "israel" };
        }
        const s = sessions[userId];
        const msg = userMessage.trim();

  console.log(`User ${userId} step=${s.step} msg="${msg}"`);

  // Step 0: greeting → ask for role
  if (s.step === 0) {
            s.step = 1;
            return "שלום! אני ג'ובי 👋 בוט חיפוש עבודה חכם.\n\nמה *התפקיד* שאתה מחפש? (לדוגמה: מפתח, מנהל שיווק, אנליסט...)";
  }

  // Step 1: got role → ask location
  if (s.step === 1) {
            s.role = msg;
            s.step = 2;
            return `מצוין! מחפשים משרות כ*${s.role}* 💼\n\nבאיזה *מיקום*? (ישראל, תל אביב, לונדון, ניו יורק...)`;
  }

  // Step 2: got location → search!
  if (s.step === 2) {
            s.location = msg;
            s.step = 3;

          const searchingMsg = `🔍 מחפש משרות *${s.role}* ב-*${s.location}*...\n\nרגע אחד 🙏`;

          // Search in background and update
          const jobs = await searchJobs(s.role, s.location);

          if (jobs.length === 0) {
                      s.step = 1;
                      return `לא מצאתי תוצאות ל-"${s.role}" ב-${s.location} 😕\n\nנסה תפקיד אחר — מה עוד מעניין אותך?`;
          }

          let reply = `🎯 *מצאתי ${jobs.length} משרות עבורך!*\n\n`;
            jobs.slice(0, 4).forEach((job, i) => {
                        const company = job.company?.display_name || "חברה";
                        const loc = job.location?.display_name || s.location;
                        const salary = job.salary_min ? `💰 ${Math.round(job.salary_min).toLocaleString()} ${job.salary_currency || ""}/שנה\n` : "";
                        reply += `*${i + 1}. ${job.title}*\n`;
                        reply += `🏢 ${company}\n`;
                        reply += `📍 ${loc}\n`;
                        reply += salary;
                        reply += `🔗 ${job.redirect_url}\n\n`;
            });
            reply += `רוצה לחפש תפקיד נוסף? כתוב *חיפוש חדש* 🔄`;
            return reply;
  }

  // Step 3+: done, offer new search
  if (msg.toLowerCase().includes("חיפוש") || msg.toLowerCase().includes("חדש") || msg.toLowerCase().includes("עוד")) {
            s.step = 1;
            return "בשמחה! 😊\n\nמה *התפקיד* שאתה מחפש הפעם?";
  }

  // Default: use Groq for free-form chat
  const reply = await askGroq([
        { role: "system", content: "אתה ג'ובי - בוט עזרה בחיפוש עבודה. ענה קצר ובעברית. אם שואלים על חיפוש משרות, הסבר שיכתבו 'חיפוש חדש'." },
        { role: "user", content: msg }
          ]);
        return reply;
}

// ── ROUTES ────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Jovi Bot v2 🚀 LIVE"));

app.post("/whatsapp", async (req, res) => {
        const { From, Body } = req.body;
        console.log(`[MSG] ${From}: ${Body}`);

           try {
                     const reply = await handleMessage(From, Body || "שלום");
                     const twiml = new twilio.twiml.MessagingResponse();
                     twiml.message(reply.slice(0, 1580));
                     res.type("text/xml").send(twiml.toString());
           } catch (err) {
                     console.error("Error:", err);
                     const twiml = new twilio.twiml.MessagingResponse();
                     twiml.message("שגיאה זמנית 😅 נסה שוב.");
                     res.type("text/xml").send(twiml.toString());
           }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Jovi v2 running on port ${PORT}`));

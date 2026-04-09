import express from "express";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessions = {};

async function askGroq(system, user) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 400, temperature: 0.3,
        messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) { return ""; }
}

async function searchJobs(role, location) {
  try {
    const isIL = /israel|tel.?aviv|jerusalem|haifa/i.test(location);
    const country = isIL ? "il" : detectCountry(location);
    const query = encodeURIComponent(role + " jobs in " + location);
    const url = "https://jsearch.p.rapidapi.com/search?query=" + query + "&page=1&num_pages=1&country=" + country + "&date_posted=month";
    console.log("[JSearch] " + url);
    const res = await fetch(url, {
      headers: { "x-rapidapi-host": "jsearch.p.rapidapi.com", "x-rapidapi-key": process.env.JSEARCH_KEY },
      signal: AbortSignal.timeout(12000)
    });
    const data = await res.json();
    console.log("[JSearch] found=" + (data.data?.length || 0));
    return (data.data || []).slice(0, 5).map(j => ({
      title: j.job_title,
      company: j.employer_name,
      location: [j.job_city, j.job_country].filter(Boolean).join(", ") || location,
      url: j.job_apply_link || j.job_google_link,
      salary: j.job_min_salary ? "$" + Math.round(j.job_min_salary).toLocaleString() + "-$" + Math.round(j.job_max_salary).toLocaleString() + "/yr" : null,
      remote: j.job_is_remote,
    }));
  } catch (e) {
    console.error("[JSearch error]", e.message);
    return [];
  }
}

function detectCountry(loc) {
  const l = loc.toLowerCase();
  if (/new york|san francisco|chicago|seattle|boston|los angeles|\busa\b/.test(l)) return "us";
  if (/london|uk|england/.test(l)) return "gb";
  if (/berlin|munich|germany/.test(l)) return "de";
  if (/paris|france/.test(l)) return "fr";
  if (/toronto|canada/.test(l)) return "ca";
  if (/sydney|australia/.test(l)) return "au";
  if (/amsterdam|netherlands/.test(l)) return "nl";
  return "us";
}

const MSG = {
  welcome: "שלום! אני ג'ובי בוט חיפוש עבודה 🤖
מחפש משרות בישראל ובכל העולם!

*מה התפקיד שאתה מחפש?*
(עברית או אנגלית)",
  askLocation: "תפקיד: *{role}* 💼

*באיזה מיקום?*
לדוגמא:
• ישראל / תל אביב
• לונדון / ניו יורק / ברלין
• remote",
  noResults: "לא מצאתי תוצאות ל"{role}" ב{location} 😕

💡 נסה באנגלית: developer, designer, analyst

מה תפקיד אחר מעניין?",
  results: "✅ *מצאתי {count} משרות ל"{role}" ב{location}!*

",
  footer: "
כתוב *חיפוש חדש* לחפש שוב 🔄",
  reset: "בשמחה! 😊

*מה התפקיד שאתה מחפש?*"
};

async function handleMessage(userId, rawMsg) {
  if (!sessions[userId]) sessions[userId] = { step: 0 };
  const s = sessions[userId];
  const msg = rawMsg.trim();

  if (/^(חיפוש חדש|חדש|שוב|new search|reset|restart)$/i.test(msg)) {
    s.step = 1;
    return MSG.reset;
  }

  if (s.step === 0) {
    s.step = 1;
    return MSG.welcome;
  }

  if (s.step === 1) {
    s.originalRole = msg;
    s.role = msg;
    s.step = 2;
    return MSG.askLocation.replace("{role}", msg);
  }

  if (s.step === 2) {
    s.location = msg;
    s.step = 3;
    const jobs = await searchJobs(s.role, s.location);

    if (jobs.length === 0) {
      s.step = 1;
      return MSG.noResults.replace("{role}", s.originalRole).replace("{location}", s.location);
    }

    let reply = MSG.results.replace("{count}", jobs.length).replace("{role}", s.originalRole).replace("{location}", s.location);
    jobs.forEach((j, i) => {
      reply += "*" + (i + 1) + ". " + j.title + "*\n";
      reply += "🏢 " + j.company + " | 📍 " + j.location;
      if (j.remote) reply += " 🌐 Remote";
      reply += "\n";
      if (j.salary) reply += "💰 " + j.salary + "\n";
      reply += "🔗 " + j.url + "\n\n";
    });
    reply += MSG.footer;
    return reply.slice(0, 1580);
  }

  const ans = await askGroq("אתה ג'ובי, בוט עזרה בחיפוש עבודה. ענה קצר ובעברית. לחיפוש כתוב 'חיפוש חדש'.", msg);
  return ans || "כתוב *חיפוש חדש* כדי לחפש משרות 🔄";
}

app.get("/", (req, res) => res.send("Jovi v6 - Hebrew - JSearch LIVE!"));

app.post("/whatsapp", async (req, res) => {
  const { From, Body } = req.body;
  console.log("[MSG]", From, "|", Body);
  try {
    const reply = await handleMessage(From, Body || "hello");
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("Error:", err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("שגיאה זמנית, נסה שוב.");
    res.type("text/xml").send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Jovi v6 Hebrew running on port " + PORT));

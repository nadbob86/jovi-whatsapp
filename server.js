import express from "express";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessions = {};

// ── GROQ AI ────────────────────────────────────────────
async function askGroq(messages) {
          try {
                      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
                                    body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 600, temperature: 0.4, messages }),
                      });
                      const data = await res.json();
                      return data.choices?.[0]?.message?.content || "שגיאה זמנית.";
          } catch (e) {
                      console.error("Groq error:", e.message);
                      return "שגיאה זמנית.";
          }
}

// ── SOURCE 1: Arbeitnow (FREE, no key, tech jobs worldwide) ──
async function searchArbeitnow(role) {
          try {
                      const q = encodeURIComponent(role);
                      const url = `https://arbeitnow.com/api/job-board-api?search=${q}`;
                      const res = await fetch(url, { headers: { "Accept": "application/json" } });
                      const data = await res.json();
                      return (data.data || []).slice(0, 3).map(j => ({
                                    title: j.title,
                                    company: j.company_name,
                                    location: j.location,
                                    url: j.url,
                                    source: "Arbeitnow",
                                    remote: j.remote,
                      }));
          } catch (e) {
                      console.error("Arbeitnow error:", e.message);
                      return [];
          }
}

// ── SOURCE 2: RemoteOK (FREE, no key, remote tech jobs) ──
async function searchRemoteOK(role) {
          try {
                      const tag = role.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                      const url = `https://remoteok.com/api?tag=${tag}`;
                      const res = await fetch(url, { headers: { "User-Agent": "JobBot/1.0" } });
                      const data = await res.json();
                      const jobs = Array.isArray(data) ? data.filter(j => j.position).slice(0, 3) : [];
                      return jobs.map(j => ({
                                    title: j.position,
                                    company: j.company,
                                    location: "Remote",
                                    url: `https://remoteok.com/remote-jobs/${j.id}`,
                                    source: "RemoteOK",
                                    remote: true,
                      }));
          } catch (e) {
                      console.error("RemoteOK error:", e.message);
                      return [];
          }
}

// ── SOURCE 3: Adzuna (UK/US/DE/FR/CA/AU) ──────────────────
async function searchAdzuna(role, countryCode) {
          try {
                      const appId = process.env.ADZUNA_APP_ID;
                      const appKey = process.env.ADZUNA_APP_KEY;
                      const q = encodeURIComponent(role);
                      const url = `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=4&what=${q}&content-type=application/json`;
                      const res = await fetch(url);
                      const data = await res.json();
                      return (data.results || []).map(j => ({
                                    title: j.title,
                                    company: j.company?.display_name || "חברה",
                                    location: j.location?.display_name || countryCode.toUpperCase(),
                                    url: j.redirect_url,
                                    salary: j.salary_min ? `${Math.round(j.salary_min / 12).toLocaleString()}₪/חודש` : null,
                                    source: "Adzuna",
                                    remote: false,
                      }));
          } catch (e) {
                      console.error("Adzuna error:", e.message);
                      return [];
          }
}

// ── MASTER SEARCH: runs all sources in parallel ──────────
async function searchAllSources(role, location) {
          const loc = (location || "").toLowerCase();

  let adzunaCountry = "gb";
          if (loc.includes("us") || loc.includes("new york") || loc.includes("san francisco") || loc.includes("ארצות הברית")) adzunaCountry = "us";
          else if (loc.includes("germany") || loc.includes("berlin") || loc.includes("גרמניה")) adzunaCountry = "de";
          else if (loc.includes("france") || loc.includes("paris") || loc.includes("צרפת")) adzunaCountry = "fr";
          else if (loc.includes("canada") || loc.includes("toronto") || loc.includes("קנדה")) adzunaCountry = "ca";
          else if (loc.includes("australia") || loc.includes("sydney") || loc.includes("אוסטרליה")) adzunaCountry = "au";

  const isRemoteSearch = loc.includes("remote") || loc.includes("מרחוק") || loc.includes("ריי");
          const isIsrael = loc.includes("israel") || loc.includes("ישראל") || loc.includes("תל אביב") || loc.includes("tel aviv");

  console.log(`Searching: role="${role}" location="${location}" country="${adzunaCountry}" israel=${isIsrael}`);

  const [arbeit, remote, adzuna] = await Promise.all([
              searchArbeitnow(role),
              isRemoteSearch || isIsrael ? searchRemoteOK(role) : Promise.resolve([]),
              isRemoteSearch ? Promise.resolve([]) : searchAdzuna(role, adzunaCountry),
            ]);

  const all = [...arbeit, ...remote, ...adzuna];
          console.log(`Results: arbeit=${arbeit.length} remote=${remote.length} adzuna=${adzuna.length} total=${all.length}`);
          return all;
}

// ── CONVERSATION ───────────────────────────────────────────
async function handleMessage(userId, userMsg) {
          if (!sessions[userId]) sessions[userId] = { step: 0 };
          const s = sessions[userId];
          const msg = userMsg.trim();

  if (s.step === 0) {
              s.step = 1;
              return "שלום! אני ג'ובי 👋 בוט חיפוש עבודה חכם.\n\n*מה התפקיד שאתה מחפש?*\n(לדוגמה: מפתח, UX designer, data analyst, product manager...)";
  }

  if (s.step === 1) {
              s.role = msg;
              s.step = 2;
              return `תפקיד: *${s.role}* 💼\n\n*באיזה מיקום?*\nלדוגמה: ישראל, תל אביב, לונדון, ניו יורק, remote...`;
  }

  if (s.step === 2) {
              s.location = msg;
              s.step = 3;

            const jobs = await searchAllSources(s.role, s.location);

            if (jobs.length === 0) {
                          s.step = 1;
                          return `לא מצאתי תוצאות ל"${s.role}" ✏️\n\nנסה תפקיד באנגלית (לדוגמה: developer, designer, manager)\nמה תפקיד אחר שמעניין אותך?`;
            }

            let reply = `🎯 *מצאתי ${jobs.length} משרות ל"${s.role}"!*\n\n`;
              jobs.slice(0, 5).forEach((j, i) => {
                            reply += `*${i + 1}. ${j.title}*\n`;
                            reply += `🏢 ${j.company}\n`;
                            reply += `📍 ${j.location}${j.remote ? " 🌐 Remote" : ""}\n`;
                            if (j.salary) reply += `💰 ${j.salary}\n`;
                            reply += `[${j.source}] ${j.url}\n\n`;
              });
              reply += `\nכתוב *חיפוש חדש* לחפש שוב 🔄`;
              return reply;
  }

  if (msg.includes("חיפוש") || msg.includes("חדש") || msg.includes("עוד") || msg.includes("שוב")) {
              s.step = 1;
              return "בשמחה! 😊 *מה התפקיד שאתה מחפש הפעם?*";
  }

  const reply = await askGroq([
          { role: "system", content: "אתה ג'ובי, בוט חיפוש עבודה. ענה קצר ובעברית. כדי לחפש משרות כתוב 'חיפוש חדש'." },
          { role: "user", content: msg }
            ]);
          return reply;
}

// ── ROUTES ─────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Jovi Bot v3 🚀 LIVE - Multi-source job search!"));

app.post("/whatsapp", async (req, res) => {
          const { From, Body } = req.body;
          console.log(`[${new Date().toISOString()}] FROM: ${From} MSG: ${Body}`);
          try {
                      const reply = await handleMessage(From, Body || "שלום");
                      const twiml = new twilio.twiml.MessagingResponse();
                      twiml.message(reply.slice(0, 1580));
                      res.type("text/xml").send(twiml.toString());
          } catch (err) {
                      console.error("Handler error:", err);
                      const twiml = new twilio.twiml.MessagingResponse();
                      twiml.message("שגיאה זמנית 😅 נסה שוב.");
                      res.type("text/xml").send(twiml.toString());
          }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Jovi v3 running on port ${PORT} 🚀`));

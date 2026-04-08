──────────────────────────────────────────────────—──────ישראלתלאביבחיפהירושליםחודששנה───────────────────────────────────מפתחמפתחתמתכנתמתכנתתמנהלמנהלתמנהלמוצרמעצבמעצבתאנליסטחשבונאיחשבונאיתעורךדיןרופארופאהאחותמהנדסמהנדסתמדעןנתוניםשיווקמכירותגיוס─────────────────────────────────────────────חיפושחדשחדששובהתחלמחדשבשמחה😊מההתפקידשאתהמחפששלוםאניגובי🤖בוטחיפושעבודה—ישראלועולםמההתפקידשאתהמחפשעבריתאואנגלית—אנימביןהכל😊תפקיד💼באיזהמיקום•ישראלתלאביבירושלים••—לעבודמכלמקום💡טיפנסהאתהתפקידבאנגליתלאמצאתיתוצאותלב😕כתובתפקידאחר✅משרותלב🏢📍🌐💰🔗━━━━━━━━━━━━━כתובחיפושחדשלחפששוב🔄אתהגוביבוטחיפושעבודהחכםענהקצרובעבריתלחיפושחדשחיפושחדשכתובחיפושחדשכדילחפשמשרות🔄───────────────────────────────────────────────────🚀—שלוםשגיאהזמנית😅נסהשוב🚀import express from "express";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessions = {};

// ── GROQ AI ──────────────────────────────────────────────
async function askGroq(systemPrompt, userMsg) {
            try {
                          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
                                          body: JSON.stringify({
                                                            model: "llama-3.3-70b-versatile",
                                                            max_tokens: 500,
                                                            temperature: 0.3,
                                                            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
                                          }),
                          });
                          const data = await res.json();
                          return data.choices?.[0]?.message?.content?.trim() || "";
            } catch (e) {
                          console.error("Groq error:", e.message);
                          return "";
            }
}

// ── SOURCE 1: Arbeitnow API (free, global tech jobs) ─────
async function searchArbeitnow(role) {
            try {
                          const url = `https://arbeitnow.com/api/job-board-api?search=${encodeURIComponent(role)}&page=1`;
                          const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
                          const data = await res.json();
                          return (data.data || []).slice(0, 4).map(j => ({
                                          title: j.title, company: j.company_name,
                                          location: j.location || "Remote",
                                          url: j.url, source: "Arbeitnow", remote: j.remote,
                          }));
            } catch (e) { console.error("Arbeitnow:", e.message); return []; }
}

// ── SOURCE 2: RemoteOK API (free, remote tech jobs) ──────
async function searchRemoteOK(role) {
            try {
                          const tag = role.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30);
                          const res = await fetch(`https://remoteok.com/api?tag=${tag}`, {
                                          headers: { "User-Agent": "JobSearchBot/1.0" }, signal: AbortSignal.timeout(8000),
                          });
                          const data = await res.json();
                          return (Array.isArray(data) ? data : []).filter(j => j.position && j.company).slice(0, 3).map(j => ({
                                          title: j.position, company: j.company,
                                          location: "🌐 Remote",
                                          url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
                                          source: "RemoteOK", remote: true,
                          }));
            } catch (e) { console.error("RemoteOK:", e.message); return []; }
}

// ── SOURCE 3: Adzuna API (global - gb/us/de/fr/ca/au) ────
async function searchAdzuna(role, country) {
            try {
                          const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&results_per_page=4&what=${encodeURIComponent(role)}&content-type=application/json`;
                          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
                          const data = await res.json();
                          return (data.results || []).map(j => ({
                                          title: j.title, company: j.company?.display_name || "חברה",
                                          location: j.location?.display_name || country.toUpperCase(),
                                          url: j.redirect_url,
                                          salary: j.salary_min ? `${Math.round(j.salary_min / 12).toLocaleString()}` : null,
                                          source: "Adzuna", remote: false,
                          }));
            } catch (e) { console.error("Adzuna:", e.message); return []; }
}

// ── GENERATE SEARCH LINKS (works for EVERY country) ──────
function buildSearchLinks(role, location) {
            const r = encodeURIComponent(role);
            const l = encodeURIComponent(location);
            const isIsrael = /israel|ישראל|תל.?אביב|tel.?aviv|jerusalem|ירושלים|haifa|חיפה/i.test(location);

  const links = [];

  if (isIsrael) {
                links.push(`🇮🇱 AllJobs: https://www.alljobs.co.il/SearchResultsPage.aspx?position=${r}`);
                links.push(`🇮🇱 Drushim: https://www.drushim.co.il/jobs/alljobs/?q=${r}`);
                links.push(`🔵 LinkedIn IL: https://www.linkedin.com/jobs/search/?keywords=${r}&location=Israel`);
  } else {
                links.push(`🔵 LinkedIn: https://www.linkedin.com/jobs/search/?keywords=${r}&location=${l}`);
                links.push(`🟡 Indeed: https://www.indeed.com/jobs?q=${r}&l=${l}`);
                links.push(`🟢 Glassdoor: https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${r}&locT=C&locName=${l}`);
  }
            links.push(`🌐 Google Jobs: https://www.google.com/search?q=${r}+jobs+${l}&ibp=htl;jobs`);
            return links;
}

// ── MASTER SEARCH ─────────────────────────────────────────
async function searchJobs(role, location) {
            const loc = location.toLowerCase();
            const isIsrael = /israel|ישראל|תל.?אביב|tel.?aviv|jerusalem|ירושלים|haifa|חיפה/i.test(loc);
            const isRemote = /remote|מרחוק/i.test(loc);

  let adzunaCountry = "gb";
            if (/\b(us|usa|new york|san francisco|chicago|seattle|boston)\b/i.test(loc)) adzunaCountry = "us";
            else if (/germany|berlin|munich|גרמניה/i.test(loc)) adzunaCountry = "de";
            else if (/france|paris|צרפת/i.test(loc)) adzunaCountry = "fr";
            else if (/canada|toronto|קנדה/i.test(loc)) adzunaCountry = "ca";
            else if (/australia|sydney|אוסטרליה/i.test(loc)) adzunaCountry = "au";

  console.log(`[SEARCH] role="${role}" location="${location}" country=${adzunaCountry} israel=${isIsrael} remote=${isRemote}`);

  const [arbeit, remote, adzuna] = await Promise.allSettled([
                searchArbeitnow(role),
                (isIsrael || isRemote) ? searchRemoteOK(role) : Promise.resolve([]),
                !isRemote ? searchAdzuna(role, adzunaCountry) : Promise.resolve([]),
              ]);

  const jobs = [
                ...(arbeit.value || []),
                ...(remote.value || []),
                ...(adzuna.value || []),
              ];

  console.log(`[RESULT] jobs found: ${jobs.length}`);
            return { jobs, links: buildSearchLinks(role, location) };
}

// ── CONVERSATION ───────────────────────────────────────────
async function handleMessage(userId, rawMsg) {
            if (!sessions[userId]) sessions[userId] = { step: 0 };
            const s = sessions[userId];
            const msg = rawMsg.trim();

  // Reset command
  if (/חיפוש חדש|חדש|שוב|restart|reset/i.test(msg) && s.step > 1) {
                s.step = 1;
                return "בשמחה! 😊\n\n*מה התפקיד שאתה מחפש?*";
  }

  if (s.step === 0) {
                s.step = 1;
                return "שלום! אני *ג'ובי* 👋 — בוט חיפוש עבודה חכם.\n\nאני מחפש משרות בישראל ובכל העולם!\n\n*מה התפקיד שאתה מחפש?*\n(לדוגמה: developer, designer, data analyst, product manager)";
  }

  if (s.step === 1) {
                s.role = msg;
                s.step = 2;
                return `תפקיד: *${s.role}* 💼\n\n*באיזה מיקום?*\nלדוגמה:\n• ישראל / תל אביב\n• ניו יורק / לונדון / ברלין\n• remote (מכל מקום)`;
  }

  if (s.step === 2) {
                s.location = msg;
                s.step = 3;

              const { jobs, links } = await searchJobs(s.role, s.location);

              let reply = `🔍 *חיפוש: "${s.role}" ב-${s.location}*\n\n`;

              if (jobs.length > 0) {
                              reply += `✅ *${jobs.length} משרות נמצאו:*\n\n`;
                              jobs.slice(0, 4).forEach((j, i) => {
                                                reply += `*${i + 1}. ${j.title}*\n`;
                                                reply += `🏢 ${j.company} | 📍 ${j.location}\n`;
                                                if (j.salary) reply += `💰 ${j.salary}/חודש\n`;
                                                reply += `🔗 ${j.url}\n\n`;
                              });
              } else {
                              reply += `📋 *חפש ישירות באתרים:*\n\n`;
              }

              reply += `━━━━━━━━━━━━━━━\n`;
                reply += `🔎 *חפש עוד משרות:*\n`;
                links.forEach(l => reply += `${l}\n`);
                reply += `\n\nכתוב *חיפוש חדש* לחפש שוב 🔄`;

              return reply.slice(0, 1580);
  }

  // Free chat with Groq
  const answer = await askGroq(
                "אתה ג'ובי, בוט חיפוש עבודה. ענה קצר ובעברית. להתחיל חיפוש חדש: כתוב 'חיפוש חדש'.",
                msg
              );
            return answer || "כתוב *חיפוש חדש* כדי לחפש משרות 🔄";
}

// ── ROUTES ─────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Jovi v4 🚀 - Global Job Search - LIVE!"));

app.post("/whatsapp", async (req, res) => {
            const { From, Body } = req.body;
            console.log(`[MSG] ${new Date().toISOString()} | ${From} | ${Body}`);
            try {
                          const reply = await handleMessage(From, Body || "שלום");
                          const twiml = new twilio.twiml.MessagingResponse();
                          twiml.message(reply);
                          res.type("text/xml").send(twiml.toString());
            } catch (err) {
                          console.error("Error:", err);
                          const twiml = new twilio.twiml.MessagingResponse();
                          twiml.message("שגיאה זמנית 😅 נסה שוב עוד רגע.");
                          res.type("text/xml").send(twiml.toString());
            }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Jovi v4 running on port ${PORT} 🚀`));

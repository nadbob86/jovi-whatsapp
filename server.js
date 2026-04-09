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
  if (/new york|san francisco|chicago|seattle|usa|boston/.test(l)) return "us";
  if (/london|england/.test(l)) return "gb";
  if (/berlin|munich|germany/.test(l)) return "de";
  if (/paris|france/.test(l)) return "fr";
  if (/toronto|canada/.test(l)) return "ca";
  if (/sydney|australia/.test(l)) return "au";
  if (/amsterdam|netherlands/.test(l)) return "nl";
  return "us";
}

async function handleMessage(userId, rawMsg) {
  if (!sessions[userId]) sessions[userId] = { step: 0 };
  const s = sessions[userId];
  const msg = rawMsg.trim();

  const isReset = msg === "new search" || msg === "reset" ||
    msg === "\u05d7\u05d9\u05e4\u05d5\u05e9 \u05d7\u05d3\u05e9" ||
    msg === "\u05d7\u05d3\u05e9" || msg === "\u05e9\u05d5\u05d1";
  if (isReset && s.step > 1) {
    s.step = 1;
    return "\u05d1\u05e9\u05de\u05d7\u05d4! \u{1F60A}\n\n\u05de\u05d4 \u05d4\u05ea\u05e4\u05e7\u05d9\u05d3 \u05e9\u05d0\u05ea\u05d4 \u05de\u05d7\u05e4\u05e9?";
  }

  if (s.step === 0) {
    s.step = 1;
    return "\u05e9\u05dc\u05d5\u05dd! \u05d0\u05e0\u05d9 \u05d2'\u05d5\u05d1\u05d9 \u{1F916}\n\u05de\u05d7\u05e4\u05e9 \u05de\u05e9\u05e8\u05d5\u05ea \u05d1\u05d9\u05e9\u05e8\u05d0\u05dc \u05d5\u05d1\u05db\u05dc \u05d4\u05e2\u05d5\u05dc\u05dd!\n\n\u05de\u05d4 \u05d4\u05ea\u05e4\u05e7\u05d9\u05d3 \u05e9\u05d0\u05ea\u05d4 \u05de\u05d7\u05e4\u05e9? \u{1F4BC}\n(\u05e2\u05d1\u05e8\u05d9\u05ea \u05d0\u05d5 \u05d0\u05e0\u05d2\u05dc\u05d9\u05ea)";
  }

  if (s.step === 1) {
    s.originalRole = msg;
    s.role = msg;
    s.step = 2;
    return "\u05ea\u05e4\u05e7\u05d9\u05d3: " + msg + " \u{1F4BC}\n\n\u05d1\u05d0\u05d9\u05d6\u05d4 \u05de\u05d9\u05e7\u05d5\u05dd?\n\u05d9\u05e9\u05e8\u05d0\u05dc / \u05ea\u05dc \u05d0\u05d1\u05d9\u05d1 / London / New York / remote";
  }

  if (s.step === 2) {
    s.location = msg;
    s.step = 3;
    const jobs = await searchJobs(s.role, s.location);

    if (jobs.length === 0) {
      s.step = 1;
      return "\u05dc\u05d0 \u05de\u05e6\u05d0\u05ea\u05d9 \u05ea\u05d5\u05e6\u05d0\u05d5\u05ea \u05dc-\"" + s.originalRole + "\" \u05d1-" + s.location + " \u{1F615}\n\n\u05d8\u05d9\u05e4: \u05e0\u05e1\u05d4 \u05d1\u05d0\u05e0\u05d2\u05dc\u05d9\u05ea (developer, designer, analyst)\n\n\u05de\u05d4 \u05ea\u05e4\u05e7\u05d9\u05d3 \u05d0\u05d7\u05e8?";
    }

    let reply = "\u2705 \u05de\u05e6\u05d0\u05ea\u05d9 " + jobs.length + " \u05de\u05e9\u05e8\u05d5\u05ea \u05dc-\"" + s.originalRole + "\" \u05d1-" + s.location + "!\n\n";
    jobs.forEach((j, i) => {
      reply += (i + 1) + ". " + j.title + "\n";
      reply += "   \u{1F3E2} " + j.company + " | \u{1F4CD} " + j.location;
      if (j.remote) reply += " (Remote)";
      reply += "\n";
      if (j.salary) reply += "   \u{1F4B0} " + j.salary + "\n";
      reply += "   \u{1F517} " + j.url + "\n\n";
    });
    reply += "\u05db\u05ea\u05d5\u05d1 '\u05d7\u05d9\u05e4\u05d5\u05e9 \u05d7\u05d3\u05e9' \u05dc\u05d7\u05e4\u05e9 \u05e9\u05d5\u05d1 \u{1F504}";
    return reply.slice(0, 1580);
  }

  const ans = await askGroq("\u05d0\u05ea\u05d4 \u05d2'\u05d5\u05d1\u05d9, \u05d1\u05d5\u05d8 \u05d7\u05d9\u05e4\u05d5\u05e9 \u05e2\u05d1\u05d5\u05d3\u05d4. \u05e2\u05e0\u05d4 \u05e7\u05e6\u05e8 \u05d5\u05d1\u05e2\u05d1\u05e8\u05d9\u05ea.", msg);
  return ans || "\u05db\u05ea\u05d5\u05d1 '\u05d7\u05d9\u05e4\u05d5\u05e9 \u05d7\u05d3\u05e9' \u05dc\u05d7\u05e4\u05e9 \u05de\u05e9\u05e8\u05d5\u05ea \u{1F504}";
}

app.get("/", (req, res) => res.send("Jovi v7 Hebrew JSearch LIVE!"));

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
    twiml.message("\u05e9\u05d2\u05d9\u05d0\u05d4, \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1.");
    res.type("text/xml").send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Jovi v7 Hebrew running on port " + PORT));

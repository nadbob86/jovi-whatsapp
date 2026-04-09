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
  if (/new york|san francisco|chicago|seattle|boston|los angeles|\bus\b|\busa\b/.test(l)) return "us";
  if (/london|uk|england/.test(l)) return "gb";
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

  if (/^(new search|start over|reset|restart|search again)$/i.test(msg)) {
    s.step = 1;
    return "What job title are you looking for?";
  }

  if (s.step === 0) {
    s.step = 1;
    return "Shalom! I am Jovi your job search assistant. I find real jobs in Israel and worldwide! What job title are you looking for? (Hebrew or English)";
  }

  if (s.step === 1) {
    s.originalRole = msg;
    s.role = msg;
    s.step = 2;
    return "Looking for: " + msg + "\n\nWhat location? (Israel / Tel Aviv / New York / London / remote)";
  }

  if (s.step === 2) {
    s.location = msg;
    s.step = 3;
    const jobs = await searchJobs(s.role, s.location);

    if (jobs.length === 0) {
      s.step = 1;
      return "No results for " + s.originalRole + " in " + s.location + ". Try in English (developer, designer, analyst). What other title?";
    }

    let reply = "Found " + jobs.length + " jobs for " + s.originalRole + " in " + s.location + "!\n\n";
    jobs.forEach((j, i) => {
      reply += (i + 1) + ". " + j.title + "\n";
      reply += "   " + j.company + " | " + j.location;
      if (j.remote) reply += " (Remote)";
      reply += "\n";
      if (j.salary) reply += "   " + j.salary + "\n";
      reply += "   " + j.url + "\n\n";
    });
    reply += "Type 'new search' to search again";
    return reply.slice(0, 1580);
  }

  const ans = await askGroq("You are Jovi a job search bot. Answer briefly. To search jobs say 'new search'.", msg);
  return ans || "Type 'new search' to search for jobs";
}

app.get("/", (req, res) => res.send("Jovi v5 Production - JSearch LIVE!"));

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
    twiml.message("Temporary error. Please try again.");
    res.type("text/xml").send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Jovi v5 running on port " + PORT));

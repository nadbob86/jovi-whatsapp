import express from "express";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Test mode - no API keys needed!
const responses = [
    "שלום! אני ג'ובי - בוט חיפוש עבודה 🤖 (מצב בדיקה)",
    "מה התפקיד שאתה מחפש? 💼",
    "באיזה עיר? 📍",
    "כמה שנות ניסיון יש לך? ⭐",
    "מחפש... 🔍 (בגרסה המלאה כאן יגיעו משרות אמיתיות מ-LinkedIn ו-Indeed!)",
    "תודה! הבוט עובד 🎉 עכשיו נחבר את ה-AI האמיתי"
  ];

const counters = {};

app.get("/", (req, res) => {
    res.send("Jovi Bot is LIVE! 🚀");
});

app.post("/whatsapp", (req, res) => {
    const { From, Body } = req.body;
    console.log(`Message from ${From}: ${Body}`);

           if (!counters[From]) counters[From] = 0;
    const reply = responses[counters[From] % responses.length];
    counters[From]++;

           const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Jovi TEST bot running on port ${PORT} 🚀`);
});

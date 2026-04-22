const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// =========================
// MEMORY + STATE
// =========================
const sessions = {};
const callState = {};

let leads = [
  { id: 1, phone: "+12038334544", address: "123 Main St", status: "new" }
];

let queue = [];

const BASE_URL = "https://ai-caller-production-88df.up.railway.app";
const CHRIS_NUMBER = process.env.CHRIS_NUMBER;

// =========================
// ROOT
// =========================
app.get("/", (req, res) => res.send("RUNNING"));

// =========================
// DASHBOARD
// =========================
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <body style="background:#000;color:#fff;font-family:sans-serif;">
    <div style="max-width:800px;margin:auto;padding:40px;">
      <img src="/logo.png" style="height:220px;display:block;margin:auto;">
      <button onclick="fetch('/start-calls')" 
        style="margin-top:30px;padding:15px;background:#fff;color:#000;font-weight:bold;border:none;border-radius:10px;display:block;margin-left:auto;margin-right:auto;cursor:pointer;">
        START CALLING
      </button>
    </div>
  </body>
  </html>
  `);
});

// =========================
// ELEVENLABS (VOICE)
// =========================
app.post("/tts", async (req, res) => {
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/bxPMdBTxMI0LMo67TDEK", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVEN_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: req.body.text,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.2,
          similarity_boost: 0.9,
          style: 0.85,
          speed: 1.15,
          use_speaker_boost: true
        }
      })
    });

    const audio = await r.arrayBuffer();
    const file = "speech_" + Date.now() + ".mp3";

    fs.writeFileSync(path.join(__dirname, file), Buffer.from(audio));

    res.json({ url: BASE_URL + "/" + file });
  } catch {
    res.json({ url: null });
  }
});

// =========================
// CALL FLOW
// =========================
app.get("/start-calls", (req, res) => {
  queue = [...leads];
  processQueue();
  res.send("OK");
});

async function processQueue() {
  if (!queue.length) return;

  const lead = queue.shift();

  await fetch(BASE_URL + "/call?to=" + lead.phone + "&address=" + encodeURIComponent(lead.address));

  setTimeout(processQueue, 15000);
}

app.get("/call", async (req, res) => {
  const params = new URLSearchParams({
    To: req.query.to,
    From: process.env.TWILIO_NUMBER,
    Url: BASE_URL + "/twilio-voice?address=" + encodeURIComponent(req.query.address)
  });

  await fetch(
    "https://api.twilio.com/2010-04-01/Accounts/" + process.env.TWILIO_SID + "/Calls.json",
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(process.env.TWILIO_SID + ":" + process.env.TWILIO_AUTH).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    }
  );

  res.send("OK");
});

// =========================
// WHISPER (TO YOU)
// =========================
app.post("/whisper", (req, res) => {
  res.type("text/xml").send(`
<Response>
  <Say>New inbound lead. You're connected.</Say>
</Response>
`);
});

// =========================
// AI VOICE
// =========================
app.all("/twilio-voice", async (req, res) => {
  const sid = req.body.CallSid;
  const input = req.body.SpeechResult;
  const address = req.query.address;

  if (!sessions[sid]) sessions[sid] = [];
  if (!callState[sid]) callState[sid] = { introStage: 0 };

  let reply;

  // =========================
  // INTRO STEP 1
  // =========================
  if (callState[sid].introStage === 0) {
    callState[sid].introStage = 1;
    reply = `Hey, is this the owner of ${address}?`;
  }

  // =========================
  // INTRO STEP 2
  // =========================
  else if (callState[sid].introStage === 1) {
    callState[sid].introStage = 2;
    reply = `awesome — just reaching out, you had filled something out about getting an offer on the place`;
  }

  // =========================
  // NORMAL CONVERSATION
  // =========================
  else if (!input) {
    reply = "yeah go ahead — I got you";
  } else {

    sessions[sid].push({ role: "user", content: input });

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 120,
        temperature: 0.85,
        system: `
You are Jack from Blackline Acquisitions.

You are calling about ${address}. They filled out a form.

You are having a NORMAL HUMAN conversation.

GOALS:
- build light rapport
- understand if they'd consider selling
- guide toward Chris seeing the property

TONE:
- relaxed
- friendly
- conversational
- not scripted

IMPORTANT:
- respond naturally to what they say
- do not act like a bot waiting for yes/no
- not every reply needs a question

BOUNDARIES:
- do not ask how long they’ve lived there
- do not ask about price, mortgage, or personal details

CHRIS:
Mention naturally:
"honestly Chris is the guy who handles everything — he’d just come by and take a look"

FLOW:
- react → relate → guide
- don’t rush

QUALIFY:
"if we came in with something that made sense, is that something you’d consider?"

SHOWING:
"what usually works best for you timing-wise for Chris to swing by?"

BOOKING:
"perfect — we’ll shoot you a quick text a few hours before just to confirm"

TRANSFER:
"yeah for sure — let me grab Chris real quick"
`,
        messages: sessions[sid]
      })
    });

    const data = await ai.json();

    let text = "";
    if (data?.content) {
      for (const b of data.content) {
        if (b.type === "text") text += b.text;
      }
    }

    reply = text.trim() || "yeah gotcha — what’s got you thinking about it?";

    // ONLY override when necessary (booking)
    const lower = input.toLowerCase();

    const gaveTime =
      lower.includes("am") ||
      lower.includes("pm") ||
      lower.includes("tomorrow") ||
      lower.includes("today") ||
      lower.match(/\d{1,2}/);

    if (gaveTime) {
      reply = "perfect — we’ll shoot you a quick text a few hours before just to confirm";
    }

    // safety: block dumb questions
    if (reply.toLowerCase().includes("how long")) {
      reply = "gotcha — if we came in with something that made sense, is that something you’d consider?";
    }

    sessions[sid].push({ role: "assistant", content: reply });
  }

  // =========================
  // TRANSFER
  // =========================
  if (reply.toLowerCase().includes("grab chris")) {
    let audioUrl = null;

    try {
      const tts = await fetch(BASE_URL + "/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "cool — I’ll grab Chris real quick" })
      });

      audioUrl = (await tts.json()).url;
    } catch {}

    return res.type("text/xml").send(`
<Response>
  ${audioUrl ? `<Play>${audioUrl}</Play>` : `<Say>Connecting</Say>`}
  <Dial>
    <Number url="${BASE_URL}/whisper">${CHRIS_NUMBER}</Number>
  </Dial>
</Response>
`);
  }

  // =========================
  // NORMAL RESPONSE
  // =========================
  let audioUrl = null;

  try {
    const tts = await fetch(BASE_URL + "/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply })
    });

    audioUrl = (await tts.json()).url;
  } catch {}

  res.type("text/xml").send(`
<Response>
  <Gather input="speech" speechTimeout="auto" timeout="4" method="POST"
    action="/twilio-voice?address=${encodeURIComponent(address)}">
    ${audioUrl ? `<Play>${audioUrl}</Play>` : `<Say>${reply}</Say>`}
  </Gather>
</Response>
`);
});

app.listen(process.env.PORT || 3000);

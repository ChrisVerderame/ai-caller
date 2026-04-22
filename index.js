const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// =========================
// MEMORY
// =========================
const sessions = {};
const callState = {};

let leads = [
  { id: 1, phone: "+12038334544", address: "123 Main St" }
];

let queue = [];

const BASE_URL = "https://ai-caller-production-88df.up.railway.app";

// =========================
// ROOT
// =========================
app.get("/", (req, res) => res.send("RUNNING"));

// =========================
// DASHBOARD (YOUR UI BACK)
// =========================
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <style>
      body { margin:0; background:#000; color:#fff; font-family:sans-serif; }
      .wrap { max-width:800px; margin:auto; padding:50px 20px; }
      .logo img { height:220px; display:block; margin:auto; }
      .btn { display:block; margin:30px auto; padding:14px 30px; background:#fff; color:#000; border:none; border-radius:12px; font-weight:bold; cursor:pointer; }
      .row { display:flex; justify-content:space-between; padding:16px 0; border-bottom:1px solid #111; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="logo"><img src="/logo.png"/></div>
      <button class="btn" onclick="start()">START CALLING</button>
      <div id="list"></div>
    </div>

    <script>
      async function start(){
        await fetch("/start-calls");
        alert("Started");
      }

      async function load(){
        const leads = await (await fetch("/leads")).json();
        const list = document.getElementById("list");
        list.innerHTML = "";

        leads.forEach(l=>{
          const row = document.createElement("div");
          row.className = "row";
          row.innerHTML = l.phone + " | " + l.address;
          list.appendChild(row);
        });
      }

      load();
    </script>
  </body>
  </html>
  `);
});

// =========================
// LEADS
// =========================
app.get("/leads", (req, res) => res.json(leads));

// =========================
// ELEVENLABS
// =========================
app.post("/tts", async (req, res) => {
  try {
    const r = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/4e32WqNVWRquDa1OcRYZ",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVEN_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: req.body.text,
          model_id: "eleven_turbo_v2",
          optimize_streaming_latency: 3
        })
      }
    );

    if (!r.ok) throw new Error();

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
          "Basic " + Buffer.from(process.env.TWILIO_SID + ":" + process.env.TWILIO_AUTH).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    }
  );

  res.send("OK");
});

// =========================
// AI VOICE (WORKING + FOLLOW-UP)
// =========================
app.all("/twilio-voice", async (req, res) => {
  const sid = req.body.CallSid;
  const input = req.body.SpeechResult;
  const address = req.query.address;

  if (!sessions[sid]) sessions[sid] = [];
  if (!callState[sid]) callState[sid] = { introDone: false };

  let reply;

  if (!callState[sid].introDone) {
    callState[sid].introDone = true;

    reply = "Hey, this is Jack from Blackline Acquisitions out of Farmington — you filled something out about getting an offer on your place at " + address + ", just wanted to follow up.";
  }
  else if (!input) {
    reply = "Go ahead.";
  }
  else {
    sessions[sid].push({ role: "user", content: input });

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 60,
        temperature: 0.8,
        system: `
You are Jack from Blackline Acquisitions.

This is a follow-up call.

Goal:
- qualify
- move toward appointment
- transfer if serious

Be casual and natural.
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

    reply = text.trim() || "What were you thinking?";
    sessions[sid].push({ role: "assistant", content: reply });
  }

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
  <Gather input="speech" bargeIn="true" speechTimeout="auto" timeout="5"
    action="/twilio-voice?address=${encodeURIComponent(address)}" method="POST">
    ${audioUrl ? `<Play>${audioUrl}</Play>` : `<Say>${reply}</Say>`}
  </Gather>
</Response>
`);
});

app.listen(process.env.PORT || 3000);

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// 🧠 MEMORY
const sessions = {};
const recordings = [];

// 🧠 LEADS
let leads = [
  { id: 1, phone: "+12038334544", address: "123 Main St", status: "new" }
];

let queue = [];

// ✅ YOUR DOMAIN
const BASE_URL = "https://ai-caller-production-88df.up.railway.app";

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => res.send("RUNNING"));

/* =========================
   DASHBOARD
========================= */
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
      body { margin:0; background:#000; color:#fff; font-family:'Inter', sans-serif; }
      .wrap { max-width:700px; margin:auto; padding:50px 20px; }
      .logo { text-align:center; margin-bottom:40px; }
      .logo img { height:200px; }
      .btn { display:block; margin:auto; padding:14px 28px; background:#fff; color:#000; border:none; border-radius:12px; font-weight:600; cursor:pointer; }
      .row { display:flex; justify-content:space-between; padding:15px 0; border-bottom:1px solid #111; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="logo"><img src="/logo.png"/></div>
      <button class="btn" onclick="start()">Start Calling</button>
      <div id="list"></div>
    </div>

    <script>
      async function start(){
        await fetch("/start-calls");
        alert("Calling started");
      }

      async function load(){
        const leads = await (await fetch("/leads")).json();
        const list = document.getElementById("list");

        leads.forEach(l=>{
          const div = document.createElement("div");
          div.className = "row";
          div.innerHTML = "<div>"+l.phone+"</div><div>"+l.address+"</div>";
          list.appendChild(div);
        });
      }

      load();
    </script>
  </body>
  </html>
  `);
});

/* =========================
   LEADS / STATUS
========================= */
app.get("/leads", (req, res) => res.json(leads));

/* =========================
   ELEVENLABS (FORCED)
========================= */
app.post("/tts", async (req, res) => {
  try {
    console.log("TTS TEXT:", req.body.text);

    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/3sfGn775ryaDXhFWHwBg",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVEN_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: req.body.text,
          model_id: "eleven_monolingual_v1"
        })
      }
    );

    const buffer = await response.arrayBuffer();

    if (response.status !== 200) {
      console.log("ELEVEN ERROR:", Buffer.from(buffer).toString());
      throw new Error("TTS failed");
    }

    const fileName = "speech_" + Date.now() + ".mp3";
    const filePath = path.join(__dirname, fileName);

    fs.writeFileSync(filePath, Buffer.from(buffer));

    const publicUrl = BASE_URL + "/" + fileName;
    console.log("AUDIO URL:", publicUrl);

    res.json({ url: publicUrl });

  } catch (err) {
    console.log("TTS FAIL:", err.message);
    res.json({ url: null });
  }
});

/* =========================
   CALL FLOW
========================= */
app.get("/start-calls", async (req, res) => {
  console.log("START CALLS");
  queue = [...leads];
  processQueue();
  res.send("STARTED");
});

async function processQueue() {
  if (!queue.length) return;

  const lead = queue.shift();
  console.log("CALLING:", lead.phone);

  await fetch(BASE_URL + "/call?to=" + lead.phone + "&address=" + encodeURIComponent(lead.address));

  setTimeout(processQueue, 15000);
}

app.get("/call", async (req, res) => {
  console.log("CALL ROUTE");

  const params = new URLSearchParams({
    To: req.query.to,
    From: process.env.TWILIO_NUMBER,
    Url: BASE_URL + "/twilio-voice?address=" + encodeURIComponent(req.query.address)
  });

  const response = await fetch(
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

  res.send(await response.text());
});

/* =========================
   AI VOICE
========================= */
app.all("/twilio-voice", async (req, res) => {
  const sid = req.body.CallSid;
  const input = req.body.SpeechResult;
  const address = req.query.address;

  if (!sessions[sid]) sessions[sid] = [];

  let reply;

  if (sessions[sid].length === 0) {
    reply = "Hey, this is about your place on " + address + " - did I catch you at a bad time?";
  } else if (!input) {
    reply = "Sorry, what was that?";
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
        max_tokens: 60,
        messages: sessions[sid]
      })
    });

    const data = await ai.json();
    reply = data.content?.[0]?.text || "Got it.";

    sessions[sid].push({ role: "assistant", content: reply });
  }

  let audioUrl = null;

  try {
    const tts = await fetch(BASE_URL + "/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply })
    });

    const result = await tts.json();
    audioUrl = result.url;

  } catch {}

  console.log("FINAL AUDIO:", audioUrl);

  // 🚨 FORCE PLAY (NO FALLBACK)
  res.type("text/xml").send(`
<Response>
  <Gather input="speech" speechTimeout="auto" method="POST"
    action="/twilio-voice?address=${encodeURIComponent(address)}">
    <Play>${audioUrl}</Play>
  </Gather>
</Response>
`);
});

app.listen(process.env.PORT || 3000);

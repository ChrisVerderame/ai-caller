const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// =========================
// MEMORY + DATA
// =========================
const sessions = {};
const recordings = [];

let leads = [
  { id: 1, phone: "+12038334544", address: "123 Main St", status: "new" }
];

let queue = [];

const BASE_URL = "https://ai-caller-production-88df.up.railway.app";

// =========================
// ROOT
// =========================
app.get("/", (req, res) => res.send("RUNNING"));

// =========================
// DASHBOARD (YOUR ORIGINAL STYLE)
// =========================
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
      body { margin:0; background:#000; color:#fff; font-family:'Inter', sans-serif; }
      .wrap { max-width:800px; margin:auto; padding:50px 20px; }
      .logo { text-align:center; margin-bottom:30px; }
      .logo img { height:240px; }
      .cta { text-align:center; margin-bottom:40px; }
      .btn { background:#fff; color:#000; font-weight:700; padding:14px 30px; border-radius:14px; border:none; cursor:pointer; }
      .row { display:flex; justify-content:space-between; align-items:center; padding:18px 0; border-bottom:1px solid #111; }
      .info { display:flex; flex-direction:column; }
      .phone { font-size:16px; font-weight:600; }
      .address { font-size:13px; color:#777; }
      select { background:#111; border:none; color:#fff; padding:6px 10px; border-radius:8px; }
      .recordings { margin-top:60px; }
      audio { width:100%; margin-top:10px; }
    </style>
  </head>

  <body>
    <div class="wrap">

      <div class="logo">
        <img src="/logo.png"/>
      </div>

      <div class="cta">
        <button class="btn" onclick="start()">START CALLING</button>
      </div>

      <div id="list"></div>

      <div class="recordings">
        <h3>CALL RECORDINGS</h3>
        <div id="recs"></div>
      </div>

    </div>

    <script>
      async function start(){
        await fetch("/start-calls");
        alert("Calling started");
      }

      async function updateStatus(id, status){
        await fetch("/update-status", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ id, status })
        });
      }

      async function load(){
        const leads = await (await fetch("/leads")).json();
        const list = document.getElementById("list");
        list.innerHTML = "";

        leads.forEach(function(l){
          const row = document.createElement("div");
          row.className = "row";

          row.innerHTML =
            '<div class="info">' +
              '<div class="phone">' + l.phone + '</div>' +
              '<div class="address">' + l.address + '</div>' +
            '</div>' +
            '<select onchange="updateStatus(' + l.id + ', this.value)">' +
              '<option value="new">New</option>' +
              '<option value="called">Called</option>' +
              '<option value="interested">Interested</option>' +
              '<option value="appointment">Appointment</option>' +
              '<option value="closed">Closed</option>' +
            '</select>';

          list.appendChild(row);
        });

        const recs = await (await fetch("/recordings")).json();
        const recDiv = document.getElementById("recs");
        recDiv.innerHTML = "";

        recs.forEach(function(r){
          const el = document.createElement("div");
          el.innerHTML = '<div>' + r.time + '</div><audio controls src="' + r.url + '"></audio>';
          recDiv.appendChild(el);
        });
      }

      load();
    </script>

  </body>
  </html>
  `);
});

// =========================
// LEADS + STATUS
// =========================
app.get("/leads", (req, res) => res.json(leads));

app.post("/update-status", (req, res) => {
  const { id, status } = req.body;
  const lead = leads.find(l => l.id == id);
  if (lead) lead.status = status;
  res.json({ success: true });
});

// =========================
// RECORDINGS
// =========================
app.get("/recordings", (req, res) => res.json(recordings));

app.post("/recording", (req, res) => {
  if (req.body.RecordingUrl) {
    recordings.unshift({
      url: req.body.RecordingUrl + ".mp3",
      time: new Date().toLocaleString()
    });
  }
  res.sendStatus(200);
});

// =========================
// ELEVENLABS (SAFE)
// =========================
app.post("/tts", async (req, res) => {
  try {
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
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8
          }
        })
      }
    );

    if (!response.ok) throw new Error("blocked");

    const audio = await response.arrayBuffer();

    const fileName = "speech_" + Date.now() + ".mp3";
    fs.writeFileSync(path.join(__dirname, fileName), Buffer.from(audio));

    res.json({ url: BASE_URL + "/" + fileName });

  } catch {
    // fallback trigger
    res.json({ url: null });
  }
});

// =========================
// CALL FLOW
// =========================
app.get("/start-calls", async (req, res) => {
  queue = [...leads];
  processQueue();
  res.send("STARTED");
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
    Url: BASE_URL + "/twilio-voice?address=" + encodeURIComponent(req.query.address),
    Record: "true",
    RecordingStatusCallback: BASE_URL + "/recording"
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
// AI VOICE
// =========================
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

    audioUrl = (await tts.json()).url;
  } catch {}

  res.type("text/xml").send(`
<Response>
  <Gather input="speech" speechTimeout="auto" method="POST"
    action="/twilio-voice?address=${encodeURIComponent(address)}">
    ${audioUrl ? `<Play>${audioUrl}</Play>` : `<Say>${reply}</Say>`}
  </Gather>
</Response>
`);
});

app.listen(process.env.PORT || 3000);

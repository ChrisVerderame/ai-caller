const express = require("express");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// 🧠 MEMORY
const sessions = {};
const recordings = [];

// 🧠 LEADS
let leads = [
  { phone: "+12038334544", address: "123 Main St", status: "new" },
  { phone: "+18605551234", address: "22 Main St", status: "new" }
];

let queue = [];

// 👉 ROOT
app.get("/", (req, res) => res.send("RUNNING"));

// 🔥 LEADS
app.get("/leads", (req, res) => res.json(leads));

// 🔥 RECORDINGS API
app.get("/recordings", (req, res) => {
  res.json(recordings);
});

// 🔥 START CALLS
app.get("/start-calls", async (req, res) => {
  queue = [...leads].sort(() => Math.random() - 0.5);
  processQueue();
  res.send("STARTED");
});

async function processQueue() {
  if (!queue.length) return;

  const lead = queue.shift();

  await fetch(
    `https://ai-caller-production-88df.up.railway.app/call?to=${lead.phone}&address=${encodeURIComponent(lead.address)}`
  );

  setTimeout(processQueue, 15000);
}

// 🔥 CALL
app.get("/call", async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH;
    const from = process.env.TWILIO_NUMBER;

    const to = req.query.to;
    const address = req.query.address || "PROPERTY";

    const params = new URLSearchParams({
      To: to,
      From: from,
      Url: `https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(address)}`,
      Record: "true",
      RecordingStatusCallback: `https://ai-caller-production-88df.up.railway.app/recording`
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      }
    );

    res.send(await response.text());
  } catch (err) {
    console.error(err);
    res.send("ERROR");
  }
});

// 🔥 RECORDING CALLBACK
app.post("/recording", (req, res) => {
  const url = req.body.RecordingUrl;

  if (url) {
    recordings.unshift({
      url: url + ".mp3",
      time: new Date().toLocaleString()
    });
  }

  res.sendStatus(200);
});

// 🔥 AI VOICE
app.all("/twilio-voice", async (req, res) => {
  const input = req.body.SpeechResult;
  const address = req.query.address || "PROPERTY";
  const sid = req.body.CallSid;

  if (!sessions[sid]) sessions[sid] = [];

  if (!input) {
    return res.send(`
      <Response>
        <Gather input="speech" action="/twilio-voice?address=${encodeURIComponent(address)}">
          <Say>CAN YOU REPEAT THAT?</Say>
        </Gather>
      </Response>
    `);
  }

  sessions[sid].push({ role: "user", content: input });

  let reply = "OKAY.";

  try {
    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 100,
        system: "YOU ARE A CASUAL REAL ESTATE CALLER. SHORT HUMAN RESPONSES.",
        messages: sessions[sid]
      })
    });

    const data = await ai.json();
    if (data.content) reply = data.content[0].text;

  } catch {}

  sessions[sid].push({ role: "assistant", content: reply });

  res.send(`
    <Response>
      <Gather input="speech" action="/twilio-voice?address=${encodeURIComponent(address)}">
        <Say>${reply}</Say>
      </Gather>
    </Response>
  `);
});

// 🔥 DASHBOARD
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>CRM</title>

    <style>
      body {
        margin:0;
        background:#000;
        color:#fff;
        font-family:-apple-system;
      }

      .nav {
        height:120px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 40px;
        border-bottom:1px solid #111;
      }

      .logo img {
        height:90px;
      }

      .btn {
        background:#fff;
        color:#000;
        font-weight:800;
        padding:14px 22px;
        border-radius:16px;
        border:none;
        cursor:pointer;
      }

      .main {
        padding:30px;
      }

      h3 {
        font-size:18px;
        color:#888;
        text-transform:uppercase;
      }

      .pipeline {
        display:flex;
        gap:20px;
        margin-bottom:40px;
      }

      .col {
        min-width:260px;
        background:#111;
        border-radius:16px;
        padding:15px;
      }

      .card {
        background:#1a1a1a;
        padding:14px;
        border-radius:14px;
        margin-bottom:12px;
      }

      .phone {
        font-size:18px;
        font-weight:800;
        text-transform:uppercase;
      }

      .address {
        font-size:14px;
        color:#aaa;
        margin-bottom:10px;
        text-transform:uppercase;
      }

      .call {
        background:#fff;
        color:#000;
        font-weight:800;
        padding:6px 10px;
        border-radius:8px;
        border:none;
      }

      .recordings {
        background:#111;
        padding:20px;
        border-radius:16px;
      }

      .rec {
        margin-bottom:10px;
      }

    </style>
  </head>

  <body>

    <div class="nav">
      <div class="logo">
        <img src="/logo.png"/>
      </div>

      <button class="btn" onclick="start()">START CALLING</button>
    </div>

    <div class="main">

      <div class="pipeline" id="pipeline">
        <div class="col"><h3>NEW</h3></div>
        <div class="col"><h3>CALLED</h3></div>
        <div class="col"><h3>INTERESTED</h3></div>
      </div>

      <div class="recordings">
        <h3>CALL RECORDINGS</h3>
        <div id="recs"></div>
      </div>

    </div>

    <script>
      async function load() {
        const leads = await (await fetch("/leads")).json();
        const cols = document.querySelectorAll(".col");

        leads.forEach(l => {
          const card = document.createElement("div");
          card.className = "card";

          card.innerHTML = \`
            <div class="phone">\${l.phone}</div>
            <div class="address">\${l.address}</div>
            <button class="call" onclick="callLead('\${l.phone}','\${l.address}')">CALL</button>
          \`;

          cols[0].appendChild(card);
        });

        const recs = await (await fetch("/recordings")).json();
        const recDiv = document.getElementById("recs");

        recs.forEach(r => {
          const div = document.createElement("div");
          div.className = "rec";

          div.innerHTML = \`
            <div>\${r.time}</div>
            <audio controls src="\${r.url}"></audio>
          \`;

          recDiv.appendChild(div);
        });
      }

      async function callLead(p,a){
        await fetch(\`/call?to=\${p}&address=\${encodeURIComponent(a)}\`);
      }

      async function start(){
        await fetch("/start-calls");
      }

      load();
    </script>

  </body>
  </html>
  `);
});

app.listen(process.env.PORT || 3000);

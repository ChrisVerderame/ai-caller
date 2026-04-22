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
  { id: 1, phone: "+12038334544", address: "123 Main St", status: "new" },
  { id: 2, phone: "+18605551234", address: "22 Main St", status: "new" }
];

let queue = [];

// 👉 ROOT
app.get("/", (req, res) => res.send("RUNNING"));

// 🔥 LEADS API
app.get("/leads", (req, res) => res.json(leads));

// 🔥 UPDATE STATUS
app.post("/update-status", (req, res) => {
  const { id, status } = req.body;
  const lead = leads.find(l => l.id == id);
  if (lead) lead.status = status;
  res.json({ success: true });
});

// 🔥 RECORDINGS
app.get("/recordings", (req, res) => res.json(recordings));

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
    const params = new URLSearchParams({
      To: req.query.to,
      From: process.env.TWILIO_NUMBER,
      Url: `https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(req.query.address)}`,
      Record: "true",
      RecordingStatusCallback: `https://ai-caller-production-88df.up.railway.app/recording`
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Calls.json`,
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
  } catch (err) {
    console.error(err);
    res.send("ERROR");
  }
});

// 🔥 RECORDING CALLBACK
app.post("/recording", (req, res) => {
  if (req.body.RecordingUrl) {
    recordings.unshift({
      url: req.body.RecordingUrl + ".mp3",
      time: new Date().toLocaleString()
    });
  }
  res.sendStatus(200);
});

// 🔥 AI VOICE (unchanged)
app.all("/twilio-voice", async (req, res) => {
  const input = req.body.SpeechResult;
  const sid = req.body.CallSid;
  const address = req.query.address || "PROPERTY";

  if (!sessions[sid]) sessions[sid] = [];

  if (!input) {
    return res.send(`
      <Response>
        <Gather input="speech" action="/twilio-voice?address=${encodeURIComponent(address)}">
          <Say>Can you repeat that?</Say>
        </Gather>
      </Response>
    `);
  }

  sessions[sid].push({ role: "user", content: input });

  let reply = "Got it.";

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
        system: "You are a casual real estate caller.",
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

// 🔥 DASHBOARD (CLEAN + FLUID)
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>CRM</title>

    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

    <style>
      body {
        margin:0;
        background:#000;
        color:#fff;
        font-family: 'Inter', sans-serif;
      }

      .nav {
        height:100px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 40px;
        border-bottom:1px solid #111;
      }

      .logo img {
        height:80px;
      }

      .btn {
        background:#fff;
        color:#000;
        font-weight:600;
        padding:12px 20px;
        border-radius:12px;
        border:none;
        cursor:pointer;
      }

      .main {
        padding:30px;
      }

      .grid {
        display:grid;
        grid-template-columns: repeat(3, 1fr);
        gap:20px;
      }

      .card {
        background:#111;
        border-radius:14px;
        padding:16px;
      }

      .phone {
        font-size:16px;
        font-weight:600;
        margin-bottom:4px;
      }

      .address {
        font-size:13px;
        color:#aaa;
        margin-bottom:10px;
      }

      select {
        width:100%;
        padding:6px;
        border-radius:8px;
        border:none;
        background:#222;
        color:white;
        margin-bottom:10px;
      }

      .call {
        background:white;
        color:black;
        font-weight:600;
        padding:6px 10px;
        border-radius:8px;
        border:none;
        cursor:pointer;
      }

      .recordings {
        margin-top:40px;
        background:#111;
        padding:20px;
        border-radius:14px;
      }
    </style>
  </head>

  <body>

    <div class="nav">
      <div class="logo">
        <img src="/logo.png"/>
      </div>
      <button class="btn" onclick="start()">Start Calling</button>
    </div>

    <div class="main">

      <div class="grid" id="grid"></div>

      <div class="recordings">
        <h3>Recordings</h3>
        <div id="recs"></div>
      </div>

    </div>

    <script>
      async function load() {
        const leads = await (await fetch("/leads")).json();
        const grid = document.getElementById("grid");

        leads.forEach(l => {
          const div = document.createElement("div");
          div.className = "card";

          div.innerHTML = \`
            <div class="phone">\${l.phone}</div>
            <div class="address">\${l.address}</div>

            <select onchange="updateStatus(\${l.id}, this.value)">
              <option value="new" \${l.status==='new'?'selected':''}>New</option>
              <option value="called" \${l.status==='called'?'selected':''}>Called</option>
              <option value="interested" \${l.status==='interested'?'selected':''}>Interested</option>
              <option value="appointment" \${l.status==='appointment'?'selected':''}>Appointment</option>
              <option value="closed" \${l.status==='closed'?'selected':''}>Closed</option>
            </select>

            <button class="call" onclick="callLead('\${l.phone}','\${l.address}')">Call</button>
          \`;

          grid.appendChild(div);
        });

        const recs = await (await fetch("/recordings")).json();
        const recDiv = document.getElementById("recs");

        recs.forEach(r => {
          const el = document.createElement("div");
          el.innerHTML = \`
            <div>\${r.time}</div>
            <audio controls src="\${r.url}"></audio>
          \`;
          recDiv.appendChild(el);
        });
      }

      async function updateStatus(id, status) {
        await fetch("/update-status", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ id, status })
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

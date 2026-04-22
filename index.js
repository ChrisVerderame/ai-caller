const express = require("express");

const app = express();

// 🔥 REQUIRED
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🔥 SERVE STATIC (logo.png)
app.use(express.static(__dirname));

// 🧠 MEMORY
const sessions = {};

// 🧠 LEADS (keep simple + working)
let leads = [
  { phone: "+12038334544", address: "123 Main St", status: "new" },
  { phone: "+18605551234", address: "22 Main St", status: "new" }
];

let queue = [];

// 👉 TEST
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🔥 LEADS API
app.get("/leads", (req, res) => {
  res.json(leads);
});

// 🔥 START AUTO CALLS
app.get("/start-calls", async (req, res) => {
  queue = [...leads].sort(() => Math.random() - 0.5);
  processQueue();
  res.send("Started");
});

async function processQueue() {
  if (queue.length === 0) return;

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

    const to = req.query.to || "+12038334544";
    const address = req.query.address || "your property";

    console.log("Calling:", to);

    const params = new URLSearchParams({
      To: to,
      From: from,
      Url: `https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(address)}`
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

    const text = await response.text();
    console.log("TWILIO RESPONSE:", text);

    res.send(text);

  } catch (err) {
    console.error("CALL ERROR:", err);
    res.send("Call failed");
  }
});

// 🔥 AI VOICE
app.all("/twilio-voice", async (req, res) => {
  try {
    const userInput = req.body.SpeechResult;
    const address = req.query.address || "your property";
    const callSid = req.body.CallSid || "test";

    if (!sessions[callSid]) sessions[callSid] = [];

    if (!userInput) {
      res.type("text/xml");
      return res.send(`
        <Response>
          <Gather input="speech" speechTimeout="auto"
            action="/twilio-voice?address=${encodeURIComponent(address)}"
            method="POST">
            <Say>I didn’t catch that, can you repeat?</Say>
          </Gather>
        </Response>
      `);
    }

    sessions[callSid].push({ role: "user", content: userInput });

    let reply = "Got it.";

    try {
      const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_KEY,
          "content-type": "application/json",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 120,
          system: "Talk like a casual real estate caller. Short, human responses.",
          messages: sessions[callSid]
        })
      });

      const data = await aiResponse.json();

      if (data.content && data.content.length > 0) {
        reply = data.content[0].text;
      }

    } catch (err) {
      console.error("AI error:", err);
    }

    sessions[callSid].push({ role: "assistant", content: reply });

    res.type("text/xml");
    res.send(`
      <Response>
        <Gather input="speech" speechTimeout="auto"
          action="/twilio-voice?address=${encodeURIComponent(address)}"
          method="POST">
          <Say>${reply}</Say>
        </Gather>
      </Response>
    `);

  } catch (err) {
    console.error(err);
    res.type("text/xml");
    res.send(`<Response><Say>Error</Say></Response>`);
  }
});

// 🔥 DASHBOARD (GLASS + PIPELINE + BIG LOGO)
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>CRM</title>

    <style>
      body {
        margin:0;
        background: radial-gradient(circle at top, #0a0a0a, #000);
        color:#f5f5f5;
        font-family:-apple-system, BlinkMacSystemFont, sans-serif;
        animation:fade 0.4s ease;
      }

      @keyframes fade {
        from {opacity:0; transform:translateY(10px);}
        to {opacity:1; transform:translateY(0);}
      }

      .nav {
        height:90px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 30px;
        border-bottom:1px solid rgba(255,255,255,0.08);
      }

      .logo img {
        height:65px;
      }

      .btn {
        background:white;
        color:black;
        font-weight:700;
        padding:12px 20px;
        border-radius:14px;
        border:none;
        cursor:pointer;
        transition:all 0.2s ease;
      }

      .btn:hover {
        transform:translateY(-2px) scale(1.03);
      }

      .main {
        padding:30px;
      }

      .pipeline {
        display:flex;
        gap:20px;
        overflow-x:auto;
      }

      .column {
        min-width:280px;
        background:rgba(255,255,255,0.05);
        backdrop-filter:blur(14px);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:18px;
        padding:18px;
      }

      .column h3 {
        font-size:20px;
        margin-bottom:15px;
        color:#aaa;
      }

      .card {
        background:rgba(255,255,255,0.07);
        border:1px solid rgba(255,255,255,0.08);
        padding:16px;
        border-radius:16px;
        margin-bottom:14px;
        transition:all 0.2s ease;
      }

      .card:hover {
        transform:translateY(-4px);
        background:rgba(255,255,255,0.12);
      }

      .phone {
        font-size:20px;
        font-weight:700;
      }

      .address {
        font-size:15px;
        color:#aaa;
        margin-bottom:12px;
      }

      .call {
        background:white;
        color:black;
        font-weight:700;
        padding:8px 12px;
        border-radius:10px;
        border:none;
        cursor:pointer;
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

      <div class="pipeline" id="pipeline">

        <div class="column" data-status="new"><h3>New</h3></div>
        <div class="column" data-status="called"><h3>Called</h3></div>
        <div class="column" data-status="interested"><h3>Interested</h3></div>
        <div class="column" data-status="appointment"><h3>Appointment</h3></div>

      </div>

    </div>

    <script>
      async function load() {
        const res = await fetch("/leads");
        const data = await res.json();

        data.forEach(l => {
          const col = document.querySelector('[data-status="' + (l.status || "new") + '"]');

          const card = document.createElement("div");
          card.className = "card";

          card.innerHTML = \`
            <div class="phone">\${l.phone}</div>
            <div class="address">\${l.address}</div>
            <button class="call" onclick="callLead('\${l.phone}','\${l.address}')">Call</button>
          \`;

          col.appendChild(card);
        });
      }

      async function callLead(phone, address) {
        await fetch(\`/call?to=\${phone}&address=\${encodeURIComponent(address)}\`);
      }

      async function start() {
        await fetch("/start-calls");
      }

      load();
    </script>

  </body>
  </html>
  `);
});

app.listen(process.env.PORT || 3000);

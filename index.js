const express = require("express");

const app = express();

// 🔥 REQUIRED FOR TWILIO
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🧠 MEMORY (per call)
const sessions = {};

// 🧠 LEADS (replace later with Sheets)
let leads = [
  { phone: "+12038334544", address: "123 Main St" },
  { phone: "+18605551234", address: "22 Main St" }
];

let queue = [];
let callCount = 0;

// 👉 TEST ROUTE
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


// 🔥 MANUAL CALL
app.get("/call", async (req, res) => {
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

  callCount++;

  res.send(await response.text());
});


// 🔥 AI VOICE HANDLER (STABLE + SPEECH FIXED)
app.all("/twilio-voice", async (req, res) => {
  try {
    const userInput = req.body.SpeechResult;
    const address = req.query.address || "your property";
    const callSid = req.body.CallSid || "test";

    console.log("SpeechResult:", userInput);

    if (!sessions[callSid]) sessions[callSid] = [];

    // 🔥 HANDLE NO SPEECH
    if (!userInput) {
      res.type("text/xml");
      return res.send(`
        <Response>
          <Gather input="speech"
            speechTimeout="auto"
            speechModel="phone_call"
            language="en-US"
            action="https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(address)}"
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
          system: `
You are a real estate acquisitions caller.

Property: ${address}

Talk casually like a real human.
Short responses. One question at a time.
`,
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
        <Gather input="speech"
          speechTimeout="auto"
          speechModel="phone_call"
          language="en-US"
          action="https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(address)}"
          method="POST">
          <Say>${reply}</Say>
        </Gather>
      </Response>
    `);

  } catch (err) {
    console.error("FATAL:", err);

    res.type("text/xml");
    res.send(`
      <Response>
        <Say>Sorry, something went wrong.</Say>
      </Response>
    `);
  }
});


// 🔥 ELITE DASHBOARD
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>AI Caller</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, sans-serif;
        background: #0b0f19;
        color: white;
        display: flex;
      }

      .sidebar {
        width: 240px;
        background: #020617;
        padding: 24px;
        height: 100vh;
      }

      .logo {
        font-size: 20px;
        margin-bottom: 30px;
      }

      .main {
        flex: 1;
        padding: 30px;
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        margin-bottom: 30px;
      }

      .btn {
        background: linear-gradient(135deg,#3b82f6,#6366f1);
        border: none;
        padding: 10px 18px;
        border-radius: 10px;
        color: white;
        cursor: pointer;
      }

      .cards {
        display: flex;
        gap: 20px;
        margin-bottom: 30px;
      }

      .card {
        background: #111827;
        padding: 20px;
        border-radius: 14px;
        width: 200px;
      }

      table {
        width: 100%;
      }

      td, th {
        padding: 12px;
      }

      .call-btn {
        background: #22c55e;
        border: none;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
      }
    </style>
  </head>

  <body>

    <div class="sidebar">
      <div class="logo">AI Caller</div>
    </div>

    <div class="main">

      <div class="topbar">
        <h1>Dashboard</h1>
        <button class="btn" onclick="start()">Start Calling</button>
      </div>

      <div class="cards">
        <div class="card">
          <h2 id="total">0</h2>
          <p>Leads</p>
        </div>
        <div class="card">
          <h2 id="calls">0</h2>
          <p>Calls</p>
        </div>
      </div>

      <table id="table">
        <tr>
          <th>Phone</th>
          <th>Address</th>
          <th></th>
        </tr>
      </table>

    </div>

    <script>
      let calls = 0;

      async function load() {
        const res = await fetch("/leads");
        const data = await res.json();

        document.getElementById("total").innerText = data.length;

        const table = document.getElementById("table");

        data.forEach(l => {
          const row = document.createElement("tr");

          row.innerHTML = \`
            <td>\${l.phone}</td>
            <td>\${l.address}</td>
            <td><button class="call-btn" onclick="callLead('\${l.phone}','\${l.address}')">Call</button></td>
          \`;

          table.appendChild(row);
        });
      }

      async function callLead(phone, address) {
        await fetch(\`/call?to=\${phone}&address=\${encodeURIComponent(address)}\`);
        calls++;
        document.getElementById("calls").innerText = calls;
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

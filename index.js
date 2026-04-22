const express = require("express");

const app = express();

// 🔥 REQUIRED FOR TWILIO
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🧠 MEMORY
const sessions = {};

// 🧠 LEADS FROM SHEET
let leads = [];
let queue = [];
let callCount = 0;

// 🔥 LOAD LEADS FROM APPS SCRIPT
async function loadLeads() {
  try {
    const res = await fetch("PASTE_YOUR_APPS_SCRIPT_URL_HERE");
    const data = await res.json();

    leads = data.map(l => ({
      name: l.name,
      phone: l.phone,
      address: l.address,
      called: l.called === true || l.called === "TRUE"
    }));

    console.log("Loaded leads:", leads.length);

  } catch (err) {
    console.error("Sheet error:", err);
  }
}

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🔥 LEADS API
app.get("/leads", async (req, res) => {
  await loadLeads();
  res.json(leads);
});

// 🔥 START AUTO CALLS
app.get("/start-calls", async (req, res) => {
  await loadLeads();

  const fresh = leads.filter(l => !l.called);

  queue = [...fresh].sort(() => Math.random() - 0.5);

  processQueue();

  res.send("Calling " + queue.length + " leads");
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

// 🔥 AI VOICE
app.all("/twilio-voice", async (req, res) => {
  try {
    const userInput = req.body.SpeechResult;
    const address = req.query.address || "your property";
    const callSid = req.body.CallSid || "test";

    console.log("SpeechResult:", userInput);

    if (!sessions[callSid]) sessions[callSid] = [];

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

Talk like a real human.
Keep it short.
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

// 🔥 DASHBOARD
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>AI Caller</title>
    <style>
      body { margin:0; font-family:sans-serif; background:#0b0f19; color:white; display:flex; }
      .sidebar { width:240px; background:#020617; padding:20px; }
      .main { flex:1; padding:30px; }
      .btn { background:#3b82f6; padding:10px 16px; border:none; border-radius:8px; color:white; cursor:pointer; }
      table { width:100%; margin-top:20px; }
      td, th { padding:10px; }
      .call { background:#22c55e; border:none; padding:6px; border-radius:6px; }
    </style>
  </head>
  <body>

  <div class="sidebar">
    <h2>AI Caller</h2>
  </div>

  <div class="main">
    <h1>Dashboard</h1>
    <button class="btn" onclick="start()">Start Calling</button>

    <table id="table">
      <tr>
        <th>Name</th>
        <th>Phone</th>
        <th>Address</th>
        <th>Status</th>
        <th></th>
      </tr>
    </table>
  </div>

  <script>
    async function load() {
      const res = await fetch("/leads");
      const data = await res.json();

      const table = document.getElementById("table");

      data.forEach(l => {
        const row = document.createElement("tr");

        row.innerHTML = \`
          <td>\${l.name}</td>
          <td>\${l.phone}</td>
          <td>\${l.address}</td>
          <td>\${l.called ? "✅ Called" : "❌ New"}</td>
          <td><button class="call" onclick="callLead('\${l.phone}','\${l.address}')">Call</button></td>
        \`;

        table.appendChild(row);
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

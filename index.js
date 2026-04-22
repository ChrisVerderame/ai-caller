const express = require("express");

const app = express();

// 🔥 REQUIRED FOR TWILIO
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🧠 MEMORY (per call)
const sessions = {};

// 🧠 LEADS (WORKING STATIC VERSION)
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

  const text = await response.text();
  console.log("TWILIO RESPONSE:", text);

  res.send(text);
});

// 🔥 AI VOICE HANDLER
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

// 🔥 CLEAN SAAS DASHBOARD
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>Your CRM</title>
    <style>
      body { margin:0; font-family:sans-serif; background:#f8fafc; }
      .navbar { height:60px; background:white; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; padding:0 20px; }
      .sidebar { width:220px; background:white; border-right:1px solid #e2e8f0; height:calc(100vh - 60px); padding:20px; }
      .main { flex:1; padding:30px; }
      .container { display:flex; }
      .btn { background:#2563eb; color:white; padding:8px 14px; border:none; border-radius:8px; cursor:pointer; }
      table { width:100%; border-collapse:collapse; background:white; border:1px solid #e2e8f0; }
      th, td { padding:12px; border-bottom:1px solid #e2e8f0; }
      .call { background:#22c55e; border:none; padding:6px 10px; border-radius:6px; cursor:pointer; }
    </style>
  </head>

  <body>

    <div class="navbar">
      <div><strong>YourBrand CRM</strong></div>
      <button class="btn" onclick="start()">Start Calling</button>
    </div>

    <div class="container">
      <div class="sidebar">
        <div>Dashboard</div>
        <div>Leads</div>
        <div>Calls</div>
      </div>

      <div class="main">
        <h2>Leads</h2>

        <table id="table">
          <tr>
            <th>Phone</th>
            <th>Address</th>
            <th></th>
          </tr>
        </table>
      </div>
    </div>

    <script>
      async function load() {
        const res = await fetch("/leads");
        const data = await res.json();

        const table = document.getElementById("table");

        data.forEach(l => {
          const row = document.createElement("tr");

          row.innerHTML = \`
            <td>\${l.phone}</td>
            <td>\${l.address}</td>
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

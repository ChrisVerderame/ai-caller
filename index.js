const express = require("express");

const app = express();

// 🔥 REQUIRED
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🔥 SERVE STATIC FILES (FOR logo.png)
app.use(express.static(__dirname));

// 🧠 MEMORY
const sessions = {};

// 🧠 LEADS (KEEP SIMPLE + WORKING)
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

// 🔥 MANUAL CALL (WITH DEBUG)
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

    console.log("SpeechResult:", userInput);

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
          system: `
You are a real estate acquisitions caller.

Talk casually like a real human.
Keep responses short.
Ask one question at a time.
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
        <Gather input="speech" speechTimeout="auto"
          action="/twilio-voice?address=${encodeURIComponent(address)}"
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

// 🔥 APPLE-STYLE DASHBOARD (LOGO READY)
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>Blackline CRM</title>

    <style>
      body {
        margin:0;
        background:#000;
        color:#e5e5e5;
        font-family:-apple-system, BlinkMacSystemFont, sans-serif;
        animation:fade 0.4s ease;
      }

      @keyframes fade {
        from { opacity:0; transform:translateY(5px); }
        to { opacity:1; transform:translateY(0); }
      }

      .nav {
        height:60px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0 20px;
        border-bottom:1px solid #1f1f1f;
      }

      .logo {
        display:flex;
        align-items:center;
        gap:10px;
      }

      .logo img {
        height:28px;
        object-fit:contain;
      }

      .btn {
        background:#0A84FF;
        border:none;
        color:white;
        padding:8px 14px;
        border-radius:10px;
        cursor:pointer;
        transition:all 0.2s ease;
      }

      .btn:hover {
        transform:translateY(-1px);
        opacity:0.9;
      }

      .container {
        padding:30px;
      }

      table {
        width:100%;
        background:#111;
        border-radius:12px;
        overflow:hidden;
        border:1px solid #1f1f1f;
      }

      th, td {
        padding:14px;
        border-bottom:1px solid #1f1f1f;
      }

      th {
        font-size:12px;
        color:#888;
        text-transform:uppercase;
      }

      tr:hover {
        background:#161616;
      }

      .call {
        background:#30D158;
        border:none;
        padding:6px 10px;
        border-radius:8px;
        cursor:pointer;
        transition:all 0.2s ease;
      }

      .call:hover {
        transform:scale(1.05);
      }
    </style>
  </head>

  <body>

    <div class="nav">
      <div class="logo">
        <img src="/logo.png" />
        <strong>Blackline</strong>
      </div>

      <button class="btn" onclick="start()">Start Calling</button>
    </div>

    <div class="container">
      <h2>Leads</h2>

      <table id="table">
        <tr>
          <th>Phone</th>
          <th>Address</th>
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

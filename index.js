const express = require("express");

const app = express();

// 🔥 REQUIRED FOR TWILIO
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🧠 MEMORY
const sessions = {};

// 🧠 TEMP LEADS
let leads = [
  { phone: "+12038334544", address: "123 Main St" }
];

let queue = [];

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🔥 DASHBOARD
app.get("/dashboard", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>AI Caller</title>
        <style>
          body {
            font-family: Arial;
            background: #0f172a;
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .card {
            background: #1e293b;
            padding: 40px;
            border-radius: 12px;
            text-align: center;
          }
          button {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border-radius: 8px;
            border: none;
            font-size: 16px;
            cursor: pointer;
          }
          .start { background: #22c55e; color: black; }
          .test { background: #3b82f6; color: white; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>AI Caller</h1>
          <button class="start" onclick="start()">Start Calls</button>
          <button class="test" onclick="test()">Test Call</button>
          <p id="status"></p>
        </div>

        <script>
          async function start() {
            document.getElementById("status").innerText = "Starting...";
            await fetch("/start-calls");
            document.getElementById("status").innerText = "Calling...";
          }

          async function test() {
            document.getElementById("status").innerText = "Calling...";
            await fetch("/call");
            document.getElementById("status").innerText = "Call sent";
          }
        </script>
      </body>
    </html>
  `);
});

// 🔥 START CALLS
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

// 🔥 AI VOICE (FIXED SPEECH)
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
            <Say>I didn’t catch that, can you say that again?</Say>
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

Talk like a normal human.
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

// 🔥 CALL
app.get("/call", async (req, res) => {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH;
  const from = process.env.TWILIO_NUMBER;

  const to = req.query.to || "+12038334544";
  const address = req.query.address || "your property";

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

  res.send(await response.text());
});

app.listen(process.env.PORT || 3000);

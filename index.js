const express = require("express");

const app = express();
app.use(express.json());

// 🧠 IN-MEMORY STORAGE (we’ll upgrade later)
let leads = [
  { phone: "+12038334544", address: "123 Main St", status: "new" },
  // add more leads here or from Sheets later
];

let callQueue = [];
let sessions = {};
let results = [];

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🔥 START AUTO CALLING
app.get("/start-calls", async (req, res) => {
  // shuffle leads
  callQueue = [...leads].sort(() => Math.random() - 0.5);

  processQueue();

  res.send("Calling started");
});

// 🔥 PROCESS CALL QUEUE
async function processQueue() {
  if (callQueue.length === 0) return;

  const lead = callQueue.shift();

  console.log("Calling:", lead.phone);

  await triggerCall(lead);

  // wait 15 seconds between calls
  setTimeout(processQueue, 15000);
}

// 🔥 TRIGGER TWILIO CALL
async function triggerCall(lead) {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH;
  const from = process.env.TWILIO_NUMBER;

  const params = new URLSearchParams({
    To: lead.phone,
    From: from,
    Url: `https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(lead.address)}&phone=${encodeURIComponent(lead.phone)}`
  });

  await fetch(
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
}

// 🧠 AI HANDLER
app.post("/twilio-voice", async (req, res) => {
  const userInput = req.body.SpeechResult || "Hello";
  const address = req.query.address || "your property";
  const phone = req.query.phone || "unknown";
  const callSid = req.body.CallSid;

  console.log("User said:", userInput);

  if (!sessions[callSid]) sessions[callSid] = [];

  sessions[callSid].push({ role: "user", content: userInput });

  let reply = "Hey, can you say that again?";

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

Your goal:
- Ask if they'd consider selling
- Keep it casual
- If interested, say: "Got it, I'll have Chris reach out"

Do NOT be robotic.
`,
        messages: sessions[callSid]
      })
    });

    const data = await aiResponse.json();

    if (data.content && data.content.length > 0) {
      reply = data.content[0].text;
    }

    // 🔥 SIMPLE LEAD DETECTION
    const lower = userInput.toLowerCase();

    if (
      lower.includes("yes") ||
      lower.includes("yeah") ||
      lower.includes("maybe") ||
      lower.includes("interested")
    ) {
      results.push({
        phone,
        address,
        status: "interested",
        transcript: sessions[callSid]
      });

      reply = "Got it, I’ll have Chris reach out shortly.";
    }

    sessions[callSid].push({ role: "assistant", content: reply });

  } catch (err) {
    console.error(err);
  }

  res.type("text/xml");
  res.send(`
    <Response>
      <Gather input="speech" bargeIn="true" action="/twilio-voice?address=${encodeURIComponent(address)}&phone=${encodeURIComponent(phone)}" method="POST">
        <Say>${reply}</Say>
      </Gather>
    </Response>
  `);
});

// 🔥 VIEW RESULTS
app.get("/results", (req, res) => {
  res.json(results);
});

app.listen(process.env.PORT || 3000);

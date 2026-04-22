const express = require("express");

const app = express();
app.use(express.json());

// 🧠 MEMORY STORE (per call)
const sessions = {};

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🧠 AI VOICE HANDLER
app.post("/twilio-voice", async (req, res) => {
  const userInput = req.body.SpeechResult || "Hello";
  const address = req.query.address || "your property";
  const callSid = req.body.CallSid;

  console.log("User said:", userInput);
  console.log("Address:", address);

  let reply = "Hey, can you say that again?";

  try {
    // 🧠 Initialize memory
    if (!sessions[callSid]) {
      sessions[callSid] = [];
    }

    // Add user input to memory
    sessions[callSid].push({
      role: "user",
      content: userInput
    });

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
You are a real estate acquisitions guy calling a homeowner.

You are calling about: ${address}

Talk casually, like a normal person—not a script.

Rules:
- Never sound robotic
- Never over-explain
- Keep sentences short
- Ask one question at a time
- Slightly imperfect wording is OK

Start like:
"Hey, this is about your place on ${address} — did I catch you at a bad time?"

Then:
- Ask timeline
- Ask condition
- Ask motivation

If they hesitate, be relaxed—not pushy.
If they show interest, move toward next step.

Sound like a real human.
`,

        messages: sessions[callSid]
      })
    });

    const data = await aiResponse.json();

    console.log("RAW AI RESPONSE:", JSON.stringify(data));

    if (data.content && data.content.length > 0) {
      reply = data.content[0].text;
    } else {
      console.error("Bad AI response:", data);
    }

    // 🧹 Clean robotic phrases
    reply = reply
      .replace(/As an AI[^.]*\./gi, "")
      .replace(/I understand that/gi, "")
      .trim();

    // Save AI reply to memory
    sessions[callSid].push({
      role: "assistant",
      content: reply
    });

  } catch (err) {
    console.error("AI error:", err);
  }

  res.type("text/xml");
  res.send(`
    <Response>
      <Gather input="speech" bargeIn="true" action="/twilio-voice?address=${encodeURIComponent(address)}" method="POST">
        <Say>${reply}</Say>
      </Gather>
    </Response>
  `);
});

// 👉 CALL TRIGGER
app.get("/call", async (req, res) => {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH;
  const from = process.env.TWILIO_NUMBER;

  const to = req.query.to || "+12038334544";
  const address = req.query.address || "your property";

  console.log("Calling:", to, "| Address:", address);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

  const params = new URLSearchParams({
    To: to,
    From: from,
    Url: `https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(address)}`
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(accountSid + ":" + authToken).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const data = await response.text();
  res.send(data);
});

app.listen(process.env.PORT || 3000);

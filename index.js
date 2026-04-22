const express = require("express");

const app = express();
app.use(express.json());

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🧠 AI VOICE HANDLER (FIXED)
app.post("/twilio-voice", async (req, res) => {
  const userInput = req.body.SpeechResult || "Hello";

  console.log("User said:", userInput);

  let reply = "Sorry, I had trouble responding.";

  try {
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: `
You are a real estate acquisitions assistant calling a homeowner.

Start like:
"Hey, this is about the property you submitted — did I catch you at a bad time?"

Ask:
- timeline
- condition
- motivation

Keep it short and natural.
`
          },
          {
            role: "user",
            content: userInput
          }
        ]
      })
    });

    const data = await aiResponse.json();

    console.log("RAW AI RESPONSE:", JSON.stringify(data));

    if (data.content && data.content.length > 0) {
      reply = data.content[0].text;
    } else {
      console.error("Bad AI response:", data);
    }

  } catch (err) {
    console.error("AI error:", err);
  }

  res.type("text/xml");
  res.send(`
    <Response>
      <Gather input="speech" action="/twilio-voice" method="POST">
        <Say>${reply}</Say>
      </Gather>
    </Response>
  `);
});

// 👉 THIS TRIGGERS A CALL
app.get("/call", async (req, res) => {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH;
  const from = process.env.TWILIO_NUMBER;

  console.log("SID:", process.env.TWILIO_SID);
  console.log("AUTH:", process.env.TWILIO_AUTH ? "exists" : "missing");

  const to = "+12038334544";

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

  const params = new URLSearchParams({
    To: to,
    From: from,
    Url: "https://ai-caller-production-88df.up.railway.app/twilio-voice"
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

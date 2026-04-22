const express = require("express");

const app = express();
app.use(express.json());

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🧠 AI VOICE HANDLER (WITH ADDRESS)
app.post("/twilio-voice", async (req, res) => {
  const userInput = req.body.SpeechResult || "Hello";
  const address = req.query.address || "your property";

  console.log("User said:", userInput);
  console.log("Address:", address);

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
You are a real estate acquisitions assistant calling a homeowner.

You are calling about the property at: ${address}

Start naturally like:
"Hey, this is about your property on ${address} — did I catch you at a bad time?"

Then:
- Ask timeline
- Ask condition
- Ask motivation
- Keep it short
- Sound human
`,
        messages: [
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
      <Gather input="speech" action="/twilio-voice?address=${encodeURIComponent(address)}" method="POST">
        <Say>${reply}</Say>
      </Gather>
    </Response>
  `);
});

// 👉 CALL TRIGGER (NOW SUPPORTS ADDRESS + DYNAMIC NUMBER)
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

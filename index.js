const express = require("express");

const app = express();

// 🔥 REQUIRED FOR TWILIO
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🧠 MEMORY
let sessions = {};

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🔥 TWILIO VOICE HANDLER (STABLE)
app.all("/twilio-voice", async (req, res) => {
  try {
    const userInput = req.body.SpeechResult || "Hello";
    const address = req.query.address || "your property";
    const phone = req.query.phone || "unknown";
    const callSid = req.body.CallSid || "test";

    console.log("User said:", userInput);

    if (!sessions[callSid]) sessions[callSid] = [];

    sessions[callSid].push({ role: "user", content: userInput });

    let reply = "Hey, this is about your property. Did I catch you at a bad time?";

    // 🧠 TRY AI (BUT NEVER BREAK CALL IF IT FAILS)
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
          max_tokens: 100,
          system: `You are a casual real estate caller talking about ${address}. Keep it short.`,
          messages: sessions[callSid]
        })
      });

      const data = await aiResponse.json();

      if (data.content && data.content.length > 0) {
        reply = data.content[0].text;
      }

    } catch (e) {
      console.error("AI ERROR:", e);
    }

    sessions[callSid].push({ role: "assistant", content: reply });

    // 🔥 ALWAYS RETURN VALID XML
    res.type("text/xml");
    res.send(`
      <Response>
        <Gather input="speech"
          action="https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(address)}&phone=${encodeURIComponent(phone)}"
          method="POST">
          <Say>${reply}</Say>
        </Gather>
      </Response>
    `);

  } catch (err) {
    console.error("FATAL ERROR:", err);

    res.type("text/xml");
    res.send(`
      <Response>
        <Say>Sorry, something went wrong.</Say>
      </Response>
    `);
  }
});

// 🔥 TEST CALL ROUTE
app.get("/call", async (req, res) => {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH;
  const from = process.env.TWILIO_NUMBER;

  const to = req.query.to || "+12038334544";
  const address = req.query.address || "123 Main St";

  const params = new URLSearchParams({
    To: to,
    From: from,
    Url: `https://ai-caller-production-88df.up.railway.app/twilio-voice?address=${encodeURIComponent(address)}&phone=${encodeURIComponent(to)}`
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

  const data = await response.text();
  res.send(data);
});

app.listen(process.env.PORT || 3000);

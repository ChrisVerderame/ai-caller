const express = require("express");

const app = express();

// REQUIRED FOR TWILIO
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 🔥 TWILIO VOICE (GUARANTEED TO WORK)
app.all("/twilio-voice", (req, res) => {
  console.log("Twilio hit /twilio-voice");

  res.type("text/xml");
  res.send(`
    <Response>
      <Say>Hello. This is a test call. If you hear this, your system is working.</Say>
    </Response>
  `);
});

// 🔥 MANUAL CALL TRIGGER
app.get("/call", async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH;
    const from = process.env.TWILIO_NUMBER;

    const to = "+12038334544"; // your number

    const params = new URLSearchParams({
      To: to,
      From: from,
      Url: "https://ai-caller-production-88df.up.railway.app/twilio-voice"
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(accountSid + ":" + authToken).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      }
    );

    const data = await response.text();
    res.send(data);

  } catch (err) {
    console.error("CALL ERROR:", err);
    res.send("Call failed");
  }
});

app.listen(process.env.PORT || 3000);

app.listen(process.env.PORT || 3000);

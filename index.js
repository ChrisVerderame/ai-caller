const express = require("express");

const app = express();
app.use(express.json());

// 👉 TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server running");
});

// 👉 TWILIO WILL HIT THIS (what the call says)
app.post("/twilio-voice", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say>Hello, this is a test call.</Say>
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

  const to = "+18607353483"; // <-- PUT YOUR REAL NUMBER HERE

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

  const params = new URLSearchParams({
    To: to,
    From: from,
    Url: "ai-caller-production-88df.up.railway.app"
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

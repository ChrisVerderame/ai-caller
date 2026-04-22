const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("Server running");
});

app.post("/twilio-voice", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Say>Hello, this is a test call.</Say>
    </Response>
  `);
});

app.listen(process.env.PORT || 3000);

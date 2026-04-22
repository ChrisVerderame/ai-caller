const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

const BASE_URL = "https://ai-caller-production-88df.up.railway.app";

// =========================
// MEMORY
// =========================
const sessions = {};
const callState = {};

// =========================
// UI (UNCHANGED)
// =========================
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <body style="background:black;color:white;font-family:sans-serif;">
    <h2>BLACKLINE CALLER</h2>
    <button onclick="fetch('/start-calls')">START</button>
  </body>
  </html>
  `);
});

// =========================
// START CALL (NOW STREAMING)
// =========================
app.get("/call", (req, res) => {
  res.type("text/xml").send(`
<Response>
  <Connect>
    <Stream url="wss://${req.headers.host}/media" />
  </Connect>
</Response>
  `);
});

// =========================
// MEDIA STREAM
// =========================
wss.on("connection", (ws) => {
  console.log("STREAM CONNECTED");

  let dgSocket = null;
  let conversation = [];

  // 🔥 CONNECT DEEPGRAM
  const dgUrl = "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000";

  dgSocket = new WebSocket(dgUrl, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_KEY}` }
  });

  dgSocket.on("message", async (msg) => {
    const dg = JSON.parse(msg);

    const transcript = dg.channel?.alternatives?.[0]?.transcript;

    if (!transcript || transcript.length < 2) return;

    console.log("USER:", transcript);

    conversation.push({ role: "user", content: transcript });

    const reply = await getAI(conversation);

    console.log("AI:", reply);

    conversation.push({ role: "assistant", content: reply });

    await streamVoice(ws, reply);
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      const audio = Buffer.from(data.media.payload, "base64");
      dgSocket.send(audio);
    }
  });
});

// =========================
// AI (FOLLOW-UP MODE)
// =========================
async function getAI(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_KEY,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 60,
      temperature: 0.8,
      system: `
You are Jack from Blackline Acquisitions in Farmington.

This is a follow-up to a form they filled out.

Goal:
- qualify lead
- move toward appointment
- transfer to Chris if hot

Tone:
- casual
- confident
- not salesy
`,
      messages
    })
  });

  const data = await res.json();

  let text = "";
  if (data.content) {
    for (const b of data.content) {
      if (b.type === "text") text += b.text;
    }
  }

  return text || "Gotcha — what were you thinking?";
}

// =========================
// STREAM VOICE
// =========================
async function streamVoice(ws, text) {
  const r = await fetch(
    "https://api.elevenlabs.io/v1/text-to-speech/4e32WqNVWRquDa1OcRYZ/stream",
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVEN_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2"
      })
    }
  );

  const reader = r.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    ws.send(JSON.stringify({
      event: "media",
      media: {
        payload: Buffer.from(value).toString("base64")
      }
    }));
  }
}

// =========================
// START SERVER
// =========================
server.listen(process.env.PORT || 3000, () => {
  console.log("RUNNING REALTIME SYSTEM");
});

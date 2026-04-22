const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fetch = require("node-fetch");
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
// ROOT
// =========================
app.get("/", (req, res) => res.send("RUNNING"));

// =========================
// DASHBOARD (UNCHANGED)
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
// TWILIO CALL (STREAM MODE)
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
// MEDIA STREAM (SAFE)
// =========================
wss.on("connection", (ws) => {
  console.log("STREAM CONNECTED");

  let dgSocket = null;
  let conversation = [];

  // ✅ SAFE DEEPGRAM INIT
  if (process.env.DEEPGRAM_KEY) {
    try {
      dgSocket = new WebSocket(
        "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000",
        {
          headers: {
            Authorization: `Token ${process.env.DEEPGRAM_KEY}`
          }
        }
      );

      dgSocket.on("message", async (msg) => {
        let dg;
        try {
          dg = JSON.parse(msg);
        } catch {
          return;
        }

        const transcript = dg?.channel?.alternatives?.[0]?.transcript;

        if (!transcript || transcript.length < 2) return;

        console.log("USER:", transcript);

        conversation.push({ role: "user", content: transcript });

        const reply = await getAI(conversation);

        console.log("AI:", reply);

        conversation.push({ role: "assistant", content: reply });

        await streamVoice(ws, reply);
      });

    } catch (err) {
      console.log("DEEPGRAM ERROR:", err.message);
    }
  } else {
    console.log("NO DEEPGRAM KEY (stream will not transcribe)");
  }

  // ✅ SAFE TWILIO AUDIO HANDLING
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.event === "media" && dgSocket) {
      try {
        const audio = Buffer.from(data.media.payload, "base64");
        dgSocket.send(audio);
      } catch {}
    }
  });
});

// =========================
// AI (FOLLOW-UP MODE)
// =========================
async function getAI(messages) {
  try {
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

This is a follow-up call from a form they filled out.

Goal:
- qualify lead
- set appointment
- transfer to Chris if serious

Tone:
- relaxed
- confident
- natural
`,
        messages
      })
    });

    const data = await res.json();

    let text = "";

    if (data && data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === "text") {
          text += block.text;
        }
      }
    }

    return text.trim() || "Gotcha — what were you thinking?";

  } catch (err) {
    console.log("AI ERROR:", err.message);
    return "Hey — can you say that again?";
  }
}

// =========================
// STREAM VOICE (SAFE)
// =========================
async function streamVoice(ws, text) {
  try {
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

  } catch (err) {
    console.log("TTS STREAM ERROR:", err.message);
  }
}

// =========================
// SERVER
// =========================
server.listen(process.env.PORT || 3000, () => {
  console.log("SERVER RUNNING (STREAM SAFE)");
});

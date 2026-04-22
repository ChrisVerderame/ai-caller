app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>

    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

    <style>
      body {
        margin:0;
        background:#000;
        color:#fff;
        font-family:'Inter', sans-serif;
      }

      .wrap {
        max-width:700px;
        margin:0 auto;
        padding:50px 20px;
      }

      .logo {
        text-align:center;
        margin-bottom:30px;
      }

      .logo img {
        height:200px;
      }

      .cta {
        text-align:center;
        margin-bottom:40px;
      }

      .btn {
        background:#fff;
        color:#000;
        font-weight:600;
        padding:14px 28px;
        border-radius:14px;
        border:none;
        cursor:pointer;
      }

      .row {
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:16px 0;
        border-bottom:1px solid #111;
      }

      .info {
        display:flex;
        flex-direction:column;
      }

      .phone {
        font-weight:600;
      }

      .address {
        font-size:13px;
        color:#777;
      }

      select {
        background:#111;
        border:none;
        color:#fff;
        padding:6px 10px;
        border-radius:8px;
      }

      .recordings {
        margin-top:50px;
      }

      audio {
        width:100%;
        margin-top:10px;
      }

    </style>

  </head>

  <body>

    <div class="wrap">

      <div class="logo">
        <img src="/logo.png"/>
      </div>

      <div class="cta">
        <button class="btn" onclick="start()">Start Calling</button>
      </div>

      <div id="list"></div>

      <div class="recordings">
        <h3>Call Recordings</h3>
        <div id="recs"></div>
      </div>

    </div>

    <script>
      async function load() {
        const leads = await (await fetch("/leads")).json();
        const list = document.getElementById("list");

        leads.forEach(l => {
          const row = document.createElement("div");
          row.className = "row";

          row.innerHTML = \`
            <div class="info">
              <div class="phone">\${l.phone}</div>
              <div class="address">\${l.address}</div>
            </div>

            <select onchange="updateStatus(\${l.id}, this.value)">
              <option value="new">New</option>
              <option value="called">Called</option>
              <option value="interested">Interested</option>
              <option value="appointment">Appointment</option>
              <option value="closed">Closed</option>
            </select>
          \`;

          list.appendChild(row);
        });

        const recs = await (await fetch("/recordings")).json();
        const recDiv = document.getElementById("recs");

        recs.forEach(r => {
          const el = document.createElement("div");
          el.innerHTML = \`
            <div>\${r.time}</div>
            <audio controls src="\${r.url}"></audio>
          \`;
          recDiv.appendChild(el);
        });
      }

      async function updateStatus(id, status) {
        await fetch("/update-status", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ id, status })
        });
      }

      async function start(){
        await fetch("/start-calls");
      }

      load();
    </script>

  </body>
  </html>
  `);
});

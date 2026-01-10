const express = require("express");
const oracledb = require("oracledb");
const common = require("oci-common");
const secrets = require("oci-secrets");
const cors = require("cors")

const app = express();
app.use(express.json());
app.use(cors());

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// =====================
// OCI + DATABASE SETUP
// =====================

let pool;

// משיכת סיסמה מה־Vault
// משיכת סיסמה מה־Vault
async function getDbPassword() {
  try {
    // 1. יצירת ה-Provider באמצעות ה-Builder החדש (חובה להשתמש ב-await וב-build())
    const provider = await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();

    const client = new secrets.SecretsClient({
      authenticationDetailsProvider: provider,
    });

    // 2. שליפת הסוד מה-Vault
    const response = await client.getSecretBundle({
      secretId: process.env.DB_SECRET_OCID,
    });

    // 3. תיקון נתיב הגישה לתוכן (Response structure update)
    const base64Content = response.secretBundle.secretBundleContent.content;
    
    return Buffer.from(base64Content, "base64").toString("utf8");
  } catch (error) {
    console.error("❌ Failed to fetch secret from Vault:", error);
    throw error;
  }
}
// יצירת Connection Pool
async function initDb() {
  const password = await getDbPassword();

  // --- הוספה חשובה: הגדרת נתיב ה-Wallet ---
  // וודא שקבצי ה-Wallet (כמו cwallet.sso) נמצאים בתיקייה הזו בשרת
  oracledb.initOracleClient({ configDir: "/app/wallet" }); 

  pool = await oracledb.createPool({
    user: "ADMIN",
    password: password,
    connectString: process.env.DB_CONNECT_STRING, // הערך gamedb_high שהזרקת ב-Terraform
  });

  console.log("✅ Database pool created");
}

// =====================
// UTILITIES
// =====================

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function withConnection(fn) {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

// =====================
// ROUTES
// =====================

app.get("/health", (_, res) => {
  res.status(200).send("OK");
});

// ---------- CREATE ROOM ----------
app.post("/create-room", async (req, res) => {
  const { roomName, creatorName } = req.body;
  const roomCode = generateRoomCode();

  await withConnection(async (conn) => {
    await conn.execute(
      `INSERT INTO rooms (room_code, room_name, game_active, turn_index, winner)
       VALUES (:c, :n, 0, 0, NULL)`,
      { c: roomCode, n: roomName }
    );

    await conn.execute(
      `INSERT INTO players (room_code, player_name, player_index)
       VALUES (:c, :p, 0)`,
      { c: roomCode, p: creatorName }
    );

    await conn.commit();
  });

  res.json({ success: true, roomCode });
});

// ---------- JOIN ROOM ----------
app.post("/join-room", async (req, res) => {
  const { roomCode, playerName } = req.body;

  const result = await withConnection(async (conn) => {
    const count = await conn.execute(
      `SELECT COUNT(*) AS CNT FROM players WHERE room_code = :c`,
      { c: roomCode }
    );

    if (count.rows[0].CNT >= 2) return false;

    await conn.execute(
      `INSERT INTO players (room_code, player_name, player_index)
       VALUES (:c, :p, 1)`,
      { c: roomCode, p: playerName }
    );

    await conn.commit();
    return true;
  });

  res.json({ success: result });
});

// ---------- START GAME ----------
app.post("/start-game", async (req, res) => {
  const { roomCode } = req.body;

  await withConnection(async (conn) => {
    await conn.execute(
      `UPDATE rooms
       SET game_active = 1, turn_index = 0, winner = NULL
       WHERE room_code = :c`,
      { c: roomCode }
    );

    await conn.execute(
      `DELETE FROM board WHERE room_code = :c`,
      { c: roomCode }
    );

    await conn.commit();
  });

  res.json({ success: true });
});

// ---------- MAKE MOVE ----------
app.post("/make-move", async (req, res) => {
  const { roomCode, index, playerIndex } = req.body;

  const success = await withConnection(async (conn) => {
    const room = await conn.execute(
      `SELECT turn_index, game_active FROM rooms WHERE room_code = :c FOR UPDATE`,
      { c: roomCode }
    );

    if (room.rows.length === 0) return false;
    if (room.rows[0].GAME_ACTIVE === 0) return false;
    if (room.rows[0].TURN_INDEX !== playerIndex) return false;

    const exists = await conn.execute(
      `SELECT 1 FROM board WHERE room_code = :c AND cell_index = :i`,
      { c: roomCode, i: index }
    );

    if (exists.rows.length > 0) return false;

    const value = playerIndex === 0 ? "X" : "O";

    await conn.execute(
      `INSERT INTO board (room_code, cell_index, value)
       VALUES (:c, :i, :v)`,
      { c: roomCode, i: index, v: value }
    );

    await conn.execute(
      `UPDATE rooms
       SET turn_index = :t
       WHERE room_code = :c`,
      { t: playerIndex === 0 ? 1 : 0, c: roomCode }
    );

    await conn.commit();
    return true;
  });

  res.json({ success });
});

// ---------- ROOM STATUS ----------
app.get("/room-status", async (req, res) => {
  const roomCode = req.query.code;

  const data = await withConnection(async (conn) => {
    const room = await conn.execute(
      `SELECT * FROM rooms WHERE room_code = :c`,
      { c: roomCode }
    );

    if (room.rows.length === 0) return null;

    const players = await conn.execute(
      `SELECT player_name FROM players
       WHERE room_code = :c ORDER BY player_index`,
      { c: roomCode }
    );

    const board = await conn.execute(
      `SELECT cell_index, value FROM board WHERE room_code = :c`,
      { c: roomCode }
    );

    const boardArr = Array(9).fill(null);
    board.rows.forEach((r) => (boardArr[r.CELL_INDEX] = r.VALUE));

    return {
      players: players.rows.map((p) => p.PLAYER_NAME),
      gameActive: room.rows[0].GAME_ACTIVE === 1,
      turnIndex: room.rows[0].TURN_INDEX,
      winner: room.rows[0].WINNER,
      board: boardArr,
    };
  });

  if (!data) {
    res.json({ success: false });
  } else {
    res.json({ success: true, ...data });
  }
});

// =====================
// START SERVER
// =====================

(async () => {
  try {
    await initDb();
    app.listen(80, () =>
      console.log("🚀 Server running on port 80")
    );
  } catch (err) {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
})();

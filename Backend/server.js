const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const os = require('oci-objectstorage');
const common = require('oci-common');

const app = express(); 

app.use(express.json());
app.use(cors());

// וודא שתיקיית ה-Frontend נמצאת בשורש הפרויקט ב-Git
app.use(express.static(path.join(__dirname, 'Frontend')));

// הגדרת OCI Object Storage
// התיקון כאן: הגישה ל-Provider צריכה להיות דרך common
const provider = new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();

// כעת ניתן להשתמש ב-provider כדי ליצור את ה-client
const client = new os.ObjectStorageClient({ authenticationDetailsProvider: provider });

const bucketName = "frontend-bucket-game"; 
const namespaceName = "axlbzs2kkeq0"; // חובה להחליף ב-Namespace שלך מה-OCI Console
const objectName = "gameData.json";

// משתנה גלובלי לחדרים
let activeRooms = {}; 

// --- פונקציות עזר לענן ---

async function loadGameData() {
    try {
        const getObjectRequest = {
            objectName: objectName,
            bucketName: bucketName,
            namespaceName: namespaceName
        };
        const response = await client.getObject(getObjectRequest);
        const chunks = [];
        for await (let chunk of response.value) {
            chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString());
    } catch (error) {
        console.log("קובץ לא נמצא או שגיאה בטעינה, מחזיר אובייקט ריק");
        return {};
    }
}

async function saveGameData(dataToSave) {
    try {
        const putObjectRequest = {
            namespaceName: namespaceName,
            bucketName: bucketName,
            objectName: objectName,
            putObjectBody: JSON.stringify(dataToSave, null, 2)
        };
        await client.putObject(putObjectRequest);
        console.log('✅ הנתונים נשמרו ב-Object Storage');
    } catch (error) {
        console.error('שגיאה בשמירה לענן:', error);
    }
}

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function checkWinner(room) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (room.board[a] && room.board[a] === room.board[b] && room.board[a] === room.board[c]) {
            room.winner = room.board[a];
            room.gameActive = false;
        }
    }
    if (!room.board.includes(null) && !room.winner) {
        room.winner = 'Draw';
        room.gameActive = false;
    }
}

// --- נתיבי שרת (API Routes) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.post('/create-room', async (req, res) => {
    activeRooms = await loadGameData(); // סנכרון מהענן
    const { roomName, creatorName } = req.body;
    const roomCode = generateRoomCode();
    
    activeRooms[roomCode] = {
        name: roomName,
        players: [creatorName],
        gameActive: false,
        board: Array(9).fill(null),
        turnIndex: 0,
        winner: null,
        lastActive: new Date()
    };
    
    await saveGameData(activeRooms); // שמירה לענן
    console.log(`Room created: ${roomCode} by ${creatorName}`);
    res.json({ success: true, roomCode: roomCode });
});

app.post('/join-room', async (req, res) => {
    activeRooms = await loadGameData(); // סנכרון מהענן
    const { roomCode, playerName } = req.body;

    if (activeRooms[roomCode]) {
        if (!activeRooms[roomCode].players.includes(playerName)) {
            activeRooms[roomCode].players.push(playerName);
            await saveGameData(activeRooms);
        }
        res.json({ success: true, roomName: activeRooms[roomCode].name });
    } else {
        res.json({ success: false, message: "החדר לא נמצא" });
    }
});

app.post('/start-game', async (req, res) => {
    activeRooms = await loadGameData();
    const { roomCode } = req.body;
    if (activeRooms[roomCode]) {
        activeRooms[roomCode].gameActive = true;
        activeRooms[roomCode].board = Array(9).fill(null);
        activeRooms[roomCode].winner = null;
        activeRooms[roomCode].turnIndex = 0;
        
        await saveGameData(activeRooms);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/reset-game', async (req, res) => {
    activeRooms = await loadGameData();
    const { roomCode } = req.body;
    if (activeRooms[roomCode]) {
        activeRooms[roomCode].gameActive = true;
        activeRooms[roomCode].board = Array(9).fill(null);
        activeRooms[roomCode].winner = null;
        activeRooms[roomCode].turnIndex = 0;
        
        await saveGameData(activeRooms);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Room not found" });
    }
});

app.post('/make-move', async (req, res) => {
    activeRooms = await loadGameData();
    const { roomCode, index, playerIndex } = req.body;
    const room = activeRooms[roomCode];

    if (room && room.gameActive && !room.winner) {
        if (room.turnIndex === playerIndex && room.board[index] === null) {
            room.board[index] = playerIndex === 0 ? 'X' : 'O';
            room.turnIndex = (room.turnIndex === 0) ? 1 : 0;
            checkWinner(room);
            
            await saveGameData(activeRooms);
            res.json({ success: true });
        } else {
            res.json({ success: false, message: "Not your turn or invalid move" });
        }
    } else {
        res.json({ success: false });
    }
});

app.get('/room-status', async (req, res) => {
    activeRooms = await loadGameData(); // תמיד להביא מצב עדכני לשחקן
    const roomCode = req.query.code;

    if (activeRooms[roomCode]) {
        res.json({ 
            success: true, 
            players: activeRooms[roomCode].players,
            gameActive: activeRooms[roomCode].gameActive,
            board: activeRooms[roomCode].board,
            turnIndex: activeRooms[roomCode].turnIndex,
            winner: activeRooms[roomCode].winner
        });
    } else {
        res.json({ success: false, message: "Room closed" });
    }
});

// הפעלת השרת
async function startServer() {
    try {
        // 1. יצירת ה-Provider עבור Instance Principals
        const provider = await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();

        // 2. יצירת ה-Client - שים לב לשינוי בפרמטר כאן!
        const client = new os.ObjectStorageClient({ 
            authenticationDetailsProvider: provider 
        });

        console.log("OCI Client initialized successfully with Instance Principals");
        
        // כאן יבוא שאר הקוד של ה-Express (app.listen וכו')
        
    } catch (error) {
        console.error("Failed to initialize OCI Client:", error);
    }
}

startServer();
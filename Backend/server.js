const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs'); // 1. הוספנו את מודול הקבצים

const app = express(); 

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../Frontend')));

// שם הקובץ לשמירה
const DATA_FILE = 'gameData.json';

// 2. פונקציה לטעינת נתונים בהפעלת השרת
function loadGameData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            console.log('✅ נתונים נטענו מקובץ הגיבוי בהצלחה!');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('שגיאה בטעינת הנתונים:', error);
    }
    return {}; // אם אין קובץ, מתחילים ריק
}

// המשתנה מקבל את הנתונים מהקובץ (אם יש)
const activeRooms = loadGameData(); 

// 3. פונקציה לשמירת המצב הנוכחי (נקרא לה אחרי כל שינוי)
function saveGameData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(activeRooms, null, 2));
        // console.log('Game data saved'); // אפשר להוריד הערה אם רוצים לראות בטרמינל
    } catch (error) {
        console.error('Error saving game data:', error);
    }
}

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// === יצירת חדר ===
app.post('/create-room', (req, res) => {
    console.log("1");
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
    saveGameData(); // <--- שמירה!
    console.log(`Room created: ${roomCode} by ${creatorName}`);
    res.json({ success: true, roomCode: roomCode });
});

// === הצטרפות לחדר ===
app.post('/join-room', (req, res) => {
    const { roomCode, playerName } = req.body;

    if (activeRooms[roomCode]) {
        if (!activeRooms[roomCode].players.includes(playerName)) {
            activeRooms[roomCode].players.push(playerName);
            saveGameData(); // <--- שמירה!
        }
        res.json({ success: true, roomName: activeRooms[roomCode].name });
    } else {
        res.json({ success: false, message: "החדר לא נמצא" });
    }
});

// === התחלת משחק ===
app.post('/start-game', (req, res) => {
    const { roomCode } = req.body;
    if (activeRooms[roomCode]) {
        activeRooms[roomCode].gameActive = true;
        activeRooms[roomCode].board = Array(9).fill(null);
        activeRooms[roomCode].winner = null;
        activeRooms[roomCode].turnIndex = 0;
        
        saveGameData(); // <--- שמירה!
        console.log(`Game started in room ${roomCode}`);
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// === איפוס משחק ===
app.post('/reset-game', (req, res) => {
    const { roomCode } = req.body;
    if (activeRooms[roomCode]) {
        activeRooms[roomCode].gameActive = true;
        activeRooms[roomCode].board = Array(9).fill(null);
        activeRooms[roomCode].winner = null;
        activeRooms[roomCode].turnIndex = 0;
        
        saveGameData(); // <--- שמירה!
        console.log(`Game reset in room ${roomCode}`);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Room not found" });
    }
});

// === ביצוע מהלך ===
app.post('/make-move', (req, res) => {
    const { roomCode, index, playerIndex } = req.body;
    const room = activeRooms[roomCode];

    if (room && room.gameActive && !room.winner) {
        if (room.turnIndex === playerIndex && room.board[index] === null) {
            room.board[index] = playerIndex === 0 ? 'X' : 'O';
            room.turnIndex = (room.turnIndex === 0) ? 1 : 0;
            checkWinner(room);
            
            saveGameData(); // <--- שמירה! (חשוב מאוד אחרי כל מהלך)
            
            res.json({ success: true });
        } else {
            res.json({ success: false, message: "Not your turn or invalid move" });
        }
    } else {
        res.json({ success: false });
    }
});

app.get('/room-status', (req, res) => {
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
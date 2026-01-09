const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const username = urlParams.get('name');

// אלמנטים
const playersList = document.getElementById('players-list');
const startBtn = document.getElementById('start-game-btn');
const gameContainer = document.getElementById('game-container');
const gameStatus = document.getElementById('game-status');
const cells = document.querySelectorAll('.cell');
const resetBtn = document.getElementById('reset-btn'); // האלמנט החדש

let myPlayerIndex = -1;

document.getElementById('display-room-code').innerText = roomCode;
document.getElementById('display-username').innerText = username;

// --- פונקציות ---

// 1. התחלת משחק
startBtn.addEventListener('click', async () => {
    await fetch('/start-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode })
    });
});

// 2. משחק חוזר (הפונקציה החדשה)
resetBtn.addEventListener('click', async () => {
    await fetch('/reset-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode })
    });
});

// 3. ביצוע מהלך
async function makeMove(index) {
    if (myPlayerIndex === -1) return; 

    await fetch('/make-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, index, playerIndex: myPlayerIndex })
    });
    fetchLobbyStatus();
}

// 4. פונקציית הפולינג הראשית
async function fetchLobbyStatus() {
    try {
        const response = await fetch(`/room-status?code=${roomCode}`);
        const data = await response.json();

        if (!data.success) {
            alert('החדר נסגר');
            window.location.href = 'index.html';
            return;
        }

        updatePlayerList(data.players);
        myPlayerIndex = data.players.indexOf(username);

        // כפתור התחלה (רק למנהל, כשהמשחק לא פעיל)
        if (myPlayerIndex === 0 && data.players.length >= 2 && !data.gameActive && !data.winner) {
            startBtn.style.display = 'block';
        } else {
            startBtn.style.display = 'none';
        }

        // ניהול מצב משחק
        if (data.gameActive || data.winner) {
            // הסתרת רשימת השחקנים והצגת הלוח
            document.getElementById('players-list').style.display = 'none';
            document.getElementById('waiting-msg')?.style.setProperty('display', 'none'); // הסתרת הודעת המתנה
            gameContainer.style.display = 'block';
            
            updateBoard(data.board);
            
            if (data.winner) {
                // === יש מנצח! ===
                gameStatus.innerText = data.winner === 'Draw' ? 'תיקו! 😐' : `המנצח הוא: ${data.winner} 🏆`;
                gameStatus.style.color = '#fab1a0'; // צבע מיוחד לסיום
                
                // הצגת כפתור "משחק חוזר"
                resetBtn.style.display = 'block';
            } else {
                // === המשחק רץ ===
                const turnName = data.players[data.turnIndex];
                const isMyTurn = (data.turnIndex === myPlayerIndex);
                gameStatus.innerText = isMyTurn ? 'התור שלך! 🫵' : `התור של ${turnName}`;
                gameStatus.style.color = isMyTurn ? '#00b894' : '#fff'; // ירוק אם זה תורי
                
                // הסתרת כפתור "משחק חוזר" בזמן משחק
                resetBtn.style.display = 'none';
            }
        } else {
            // אם המשחק לא פעיל ואין מנצח (חזרנו ללובי)
            gameContainer.style.display = 'none';
            document.getElementById('players-list').style.display = 'block';
        }

    } catch (error) {
        console.error(error);
    }
}

function updatePlayerList(players) {
    playersList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p + (p === username ? ' (אתה)' : '');
        playersList.appendChild(li);
    });
}

function updateBoard(boardData) {
    cells.forEach((cell, index) => {
        cell.innerText = boardData[index] || '';
        cell.style.color = boardData[index] === 'X' ? '#ff7675' : '#74b9ff';
        // אם המשבצת תפוסה, משנים את הסמן כדי שיראה לא לחיץ
        cell.style.cursor = boardData[index] ? 'default' : 'pointer';
    });
}

setInterval(fetchLobbyStatus, 1000);
fetchLobbyStatus();
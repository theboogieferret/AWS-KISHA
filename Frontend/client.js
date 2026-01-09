// פונקציה ליצירת חדר
async function createRoom() {
    const username = document.getElementById('username').value.trim(); // .trim() מוחק רווחים מיותרים
    const roomName = document.getElementById('room-name').value;

    // --- בדיקה 1: האם יש שם לשחקן? ---
    if (!username) {
        alert('שגיאה: חובה להכניס שם שחקן כדי ליצור חדר!');
        return; // עוצר את הפונקציה כאן
    }

    // בדיקה 2: האם יש שם לחדר?
    if (!roomName) {
        alert('נא לבחור שם לחדר');
        return;
    }

    try {
        const response = await fetch('/create-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName, creatorName: username })
        });

        const data = await response.json();
        
        if (data.success) {
            // מעבר לדף המשחק (חלון חדש באותה לשונית)
            window.location.href = `game.html?room=${data.roomCode}&name=${username}`;
        } else {
            alert('הייתה בעיה ביצירת החדר');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// פונקציה להצטרפות לחדר קיים
async function joinRoom() {
    const username = document.getElementById('username').value.trim();
    const roomCode = document.getElementById('room-code').value;

    // --- בדיקה 1: האם יש שם לשחקן? ---
    if (!username) {
        alert('שגיאה: חובה להכניס שם שחקן כדי להצטרף לחדר!');
        return; // עוצר כאן ולא ממשיך לשרת
    }

    // בדיקה 2: האם הוזן קוד חדר?
    if (!roomCode) {
        alert('נא להכניס קוד חדר');
        return;
    }

    try {
        const response = await fetch('/join-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode, playerName: username })
        });

        const data = await response.json();

        if (data.success) {
            // מעבר לדף המשחק
            window.location.href = `game.html?room=${roomCode}&name=${username}`;
        } else {
            // כאן המשתמש יראה שגיאה אם החדר לא קיים
            alert('שגיאה: ' + data.message);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// חיבור הכפתורים לפונקציות (במידה ולא עשית את זה ב-HTML)
// וודא שזה מתאים ל-HTML שלך, או שתשתמש ב-onclick ב-HTML עצמו
const createBtn = document.querySelector('.create-room .btn');
if (createBtn) createBtn.addEventListener('click', createRoom);

const joinBtn = document.querySelector('.join-room .btn');
if (joinBtn) joinBtn.addEventListener('click', joinRoom);

// כפתור השם הרנדומלי (נשאר כמו שהיה)
const randomBtn = document.getElementById('random-btn');
if (randomBtn) {
    randomBtn.addEventListener('click', function() {
        const names = ['נמר_עצבני', 'לוחם_הצללים', 'פיצה_בלי_זיתים', 'קפטן_קוד', 'נינגה_101'];
        const randomName = names[Math.floor(Math.random() * names.length)];
        document.getElementById('username').value = randomName;
    });
}
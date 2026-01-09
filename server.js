const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let gameStatus = 'LOBBY'; 
let scores = { p1: 0, p2: 0 }; // SKOR TAKİBİ

io.on('connection', (socket) => {
  console.log('Bağlantı:', socket.id);

  socket.on('joinGame', (name) => {
    let role = 'spectator';
    const p1Exists = Object.values(players).some(p => p.role === 'player1');
    const p2Exists = Object.values(players).some(p => p.role === 'player2');

    if (!p1Exists) role = 'player1';
    else if (!p2Exists) role = 'player2';

    players[socket.id] = {
      id: socket.id, name: name, role: role, isReady: false, x: 0, y: 0
    };

    socket.emit('joined', { role: role });
    // Yeni giren kişiye mevcut skoru gönder
    socket.emit('updateScore', scores);
    io.emit('updateLobby', players);

    if (gameStatus === 'PLAYING') socket.emit('gameStart', { players, scores });
  });

  socket.on('playerReady', () => {
    if (players[socket.id]) {
      players[socket.id].isReady = !players[socket.id].isReady;
      io.emit('updateLobby', players);

      const p1 = Object.values(players).find(p => p.role === 'player1');
      const p2 = Object.values(players).find(p => p.role === 'player2');

      if (p1 && p2 && p1.isReady && p2.isReady) {
        gameStatus = 'PLAYING';
        scores = { p1: 0, p2: 0 }; // Maç başı skor sıfırla
        io.emit('gameStart', { players, scores });
      }
    }
  });

  socket.on('updateState', (data) => { socket.broadcast.emit('playerUpdated', data); });
  socket.on('attack', () => { socket.broadcast.emit('enemyAttack'); });
  socket.on('hit', (data) => { socket.broadcast.emit('enemyHit', data); });

  // --- OYUN BİTİŞ MANTIĞI ---
  socket.on('playerDied', () => {
    if (gameStatus !== 'PLAYING') return; 
    
    // Ölen kişiyi bul
    const loser = players[socket.id];
    if (!loser) return;

    // Skoru güncelle
    if (loser.role === 'player1') scores.p2++;
    else if (loser.role === 'player2') scores.p1++;

    io.emit('updateScore', scores);

    // KAZANAN VAR MI? (İlk 2 yapan kazanır)
    if (scores.p1 >= 2 || scores.p2 >= 2) {
        gameStatus = 'FINISHED';
        let winnerName = scores.p1 > scores.p2 ? "OYUNCU 1" : "OYUNCU 2";
        
        // İsmi bulmaya çalış
        const winnerPlayer = Object.values(players).find(p => p.role === (scores.p1 > scores.p2 ? 'player1' : 'player2'));
        if(winnerPlayer) winnerName = winnerPlayer.name;

        io.emit('showGameOver', { name: winnerName });

        setTimeout(() => {
            gameStatus = 'LOBBY';
            scores = { p1: 0, p2: 0 };
            Object.keys(players).forEach(id => players[id].isReady = false);
            io.emit('gameReset', { message: 'Yeni maç için hazır olun!' });
            io.emit('updateLobby', players);
        }, 4000);
    } 
    else {
        // RAUNT BİTTİ, DEVAM EDİYORUZ
        io.emit('roundOver', { scores });
        
        // 3 Saniye sonra yeni raunt başlat (Pozisyonları resetle)
        setTimeout(() => {
            if(gameStatus === 'PLAYING') {
                io.emit('startNextRound');
            }
        }, 3000);
    }
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      delete players[socket.id];
      if (gameStatus === 'PLAYING' && (player.role === 'player1' || player.role === 'player2')) {
        gameStatus = 'LOBBY';
        scores = { p1: 0, p2: 0 };
        Object.keys(players).forEach(id => players[id].isReady = false);
        io.emit('gameReset', { message: 'Rakip ayrıldı. Maç iptal.' });
      }
      io.emit('updateLobby', players);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: ${PORT}`);
});
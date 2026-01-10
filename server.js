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
let scores = { p1: 0, p2: 0 }; 
let isRoundProcessing = false; // YENİ: Raunt karışıklığını önleyen kilit

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
        scores = { p1: 0, p2: 0 }; 
        isRoundProcessing = false; // Kilidi aç
        io.emit('gameStart', { players, scores });
      }
    }
  });

  socket.on('updateState', (data) => { socket.broadcast.emit('playerUpdated', data); });
  socket.on('attack', () => { socket.broadcast.emit('enemyAttack'); });
  socket.on('hit', (data) => { socket.broadcast.emit('enemyHit', data); });

  // --- OYUN BİTİŞ VE RAUNT MANTIĞI (DÜZELTİLDİ) ---
  socket.on('playerDied', () => {
    // Eğer oyun oynanmıyorsa veya zaten bir ölüm işlemi yapılıyorsa DUR.
    if (gameStatus !== 'PLAYING' || isRoundProcessing) return; 
    
    isRoundProcessing = true; // KİLİTLE
    
    const loser = players[socket.id];
    if (!loser) return;

    // Skoru güncelle
    if (loser.role === 'player1') scores.p2++;
    else if (loser.role === 'player2') scores.p1++;

    io.emit('updateScore', scores);

    // MAÇ BİTTİ Mİ? (2 Olan Kazanır)
    if (scores.p1 >= 2 || scores.p2 >= 2) {
        gameStatus = 'FINISHED';
        let winnerName = scores.p1 > scores.p2 ? "OYUNCU 1" : "OYUNCU 2";
        const winnerPlayer = Object.values(players).find(p => p.role === (scores.p1 > scores.p2 ? 'player1' : 'player2'));
        if(winnerPlayer) winnerName = winnerPlayer.name;

        io.emit('showGameOver', { name: winnerName });

        setTimeout(() => {
            gameStatus = 'LOBBY';
            scores = { p1: 0, p2: 0 };
            isRoundProcessing = false;
            Object.keys(players).forEach(id => players[id].isReady = false);
            io.emit('gameReset', { message: 'Yeni maç için hazır olun!' });
            io.emit('updateLobby', players);
        }, 4000);
    } 
    else {
        // SADECE RAUNT BİTTİ
        io.emit('roundOver');
        
        // 3 Saniye sonra yeni raunt
        setTimeout(() => {
            if(gameStatus === 'PLAYING') {
                isRoundProcessing = false; // Kilidi aç
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
        isRoundProcessing = false;
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
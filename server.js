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
    io.emit('updateLobby', players);

    if (gameStatus === 'PLAYING') socket.emit('gameStart', players);
  });

  socket.on('playerReady', () => {
    if (players[socket.id]) {
      players[socket.id].isReady = !players[socket.id].isReady;
      io.emit('updateLobby', players);

      const p1 = Object.values(players).find(p => p.role === 'player1');
      const p2 = Object.values(players).find(p => p.role === 'player2');

      if (p1 && p2 && p1.isReady && p2.isReady) {
        gameStatus = 'PLAYING';
        io.emit('gameStart', players);
      }
    }
  });

  socket.on('updateState', (data) => { socket.broadcast.emit('playerUpdated', data); });
  socket.on('attack', () => { socket.broadcast.emit('enemyAttack'); });
  socket.on('hit', (data) => { socket.broadcast.emit('enemyHit', data); });

  // --- OYUN BİTİŞ MANTIĞI ---
  socket.on('playerDied', () => {
    if (gameStatus !== 'PLAYING') return; // Zaten bittiyse tekrar tetikleme
    
    gameStatus = 'FINISHED';
    
    // Ölen kişiyi bul
    const loser = players[socket.id];
    let winnerName = "Bilinmiyor";

    // Diğer oyuncuyu bul (Kazanan odur)
    const winner = Object.values(players).find(p => p.role !== 'spectator' && p.role !== loser.role);
    if (winner) winnerName = winner.name;

    // Herkese kazananı duyur
    io.emit('showGameOver', { name: winnerName });

    // 4 Saniye sonra lobiye at
    setTimeout(() => {
        gameStatus = 'LOBBY';
        Object.keys(players).forEach(id => players[id].isReady = false); // Hazırları boz
        io.emit('gameReset');
        io.emit('updateLobby', players);
    }, 4000);
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      delete players[socket.id];
      if (gameStatus === 'PLAYING' && (player.role === 'player1' || player.role === 'player2')) {
        gameStatus = 'LOBBY';
        Object.keys(players).forEach(id => players[id].isReady = false);
        io.emit('gameReset');
      }
      io.emit('updateLobby', players);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: ${PORT}`);
});
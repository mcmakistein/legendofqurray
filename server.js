const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

// OYUN DURUMU
let players = {};
let gameStatus = 'LOBBY'; // LOBBY veya PLAYING

io.on('connection', (socket) => {
  console.log('Bağlantı:', socket.id);

  // 1. Oyuncu Giriş Yaptığında
  socket.on('joinGame', (name) => {
    // Rol Belirle
    let role = 'spectator';
    const p1Exists = Object.values(players).some(p => p.role === 'player1');
    const p2Exists = Object.values(players).some(p => p.role === 'player2');

    if (!p1Exists) role = 'player1';
    else if (!p2Exists) role = 'player2';

    // Oyuncuyu Kaydet
    players[socket.id] = {
      id: socket.id,
      name: name,
      role: role,
      isReady: false,
      x: 0, y: 0
    };

    socket.emit('joined', { role: role });
    io.emit('updateLobby', players); // Herkese listeyi güncelle

    // Eğer oyun zaten oynanıyorsa ve bu kişi izleyiciyse maçı başlat (izlemesi için)
    if (gameStatus === 'PLAYING') {
      socket.emit('gameStart', players);
    }
  });

  // 2. Oyuncu Hazır Olduğunda
  socket.on('playerReady', () => {
    if (players[socket.id]) {
      players[socket.id].isReady = !players[socket.id].isReady; // Durumu tersine çevir
      io.emit('updateLobby', players);

      // Kontrol: Herkes Hazır mı?
      const p1 = Object.values(players).find(p => p.role === 'player1');
      const p2 = Object.values(players).find(p => p.role === 'player2');

      if (p1 && p2 && p1.isReady && p2.isReady) {
        gameStatus = 'PLAYING';
        io.emit('gameStart', players);
        console.log("Oyun Başladı!");
      }
    }
  });

  // 3. Oyun İçi Veriler
  socket.on('updateState', (data) => {
    socket.broadcast.emit('playerUpdated', data);
  });

  socket.on('attack', () => { socket.broadcast.emit('enemyAttack'); });
  socket.on('hit', (data) => { socket.broadcast.emit('enemyHit', data); });

  // 4. Çıkış (Reset)
  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      delete players[socket.id];
      
      // Eğer savaşanlardan biri çıktıysa oyunu bitir
      if (gameStatus === 'PLAYING' && (player.role === 'player1' || player.role === 'player2')) {
        gameStatus = 'LOBBY';
        // Kalan oyuncuların ready durumunu sıfırla
        Object.keys(players).forEach(id => players[id].isReady = false);
        io.emit('gameReset'); // Herkesi lobiye at
      }
      
      io.emit('updateLobby', players);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: ${PORT}`);
});
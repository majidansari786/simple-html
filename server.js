const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Serve a default favicon to prevent 404 errors (optional)
app.get('/favicon.ico', (req, res) => res.status(204).end()); // Return no content for favicon

let players = {};
let leaderboard = [];

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('move', (data) => {
    if (!players[socket.id]) {
      players[socket.id] = { name: data.name || 'Unknown', health: 100, score: 0 };
    }
    players[socket.id] = { ...players[socket.id], ...data };
    io.emit('updatePlayers', players);
  });

  socket.on('damage', (data) => {
    const { targetId, amount } = data;
    if (players[targetId]) {
      players[targetId].health -= amount;
      if (players[targetId].health <= 0) {
        io.to(targetId).emit('destroyed');
        leaderboard.push({ name: players[targetId].name, score: players[targetId].score });
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 5);
        io.emit('updateLeaderboard', leaderboard);
        delete players[targetId];
      }
      io.emit('updatePlayers', players);
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      leaderboard.push({ name: players[socket.id].name, score: players[socket.id].score });
      leaderboard.sort((a, b) => b.score - a.score);
      leaderboard = leaderboard.slice(0, 5);
      io.emit('updateLeaderboard', leaderboard);
      delete players[socket.id];
    }
    io.emit('updatePlayers', players);
  });
});

http.listen(3000, () => console.log('Server running on port 3000'));
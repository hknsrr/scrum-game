const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let rooms = {};

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '/')));

io.on('connection', (socket) => {

    socket.on('joinRoom', ({ room, name, isMaster }) => {
        socket.join(room);
        if (!rooms[room]) rooms[room] = { master: null, users: {} };

        if (isMaster) {
            rooms[room].master = socket.id;
        }

        rooms[room].users[socket.id] = { name, vote: null };

        io.to(room).emit('updateUsers', rooms[room].users);
    });

    socket.on('vote', ({ room, vote }) => {
    
        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].vote = vote;
    
            // Eğer tüm kullanıcılar oy kullandıysa Scrum Master'a bildir
            if (Object.values(rooms[room].users).every(user => user.vote !== null)) {
                io.to(rooms[room].master).emit('allVoted');
            }
    
            // Kullanıcıların güncellenmiş listesini gönder
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });
    

    socket.on('showVotes', room => {
        if (rooms[room] && socket.id === rooms[room].master) {
            io.to(room).emit('updateVotes', rooms[room].users);
        }
    });

    socket.on('disconnect', () => {
        for (let room in rooms) {
            if (rooms[room].users[socket.id]) {
                delete rooms[room].users[socket.id];
                io.to(room).emit('updateUsers', rooms[room].users);
            }
        }
    });


    socket.on('resetVotes', (room) => {
        if (rooms[room]) {
            for (let userId in rooms[room].users) {
                rooms[room].users[userId].vote = null;
            }
            io.to(room).emit('votesReset', rooms[room].users);
        }
    });

});

server.listen(PORT, () => {
    console.log('Server listening on port 3000');
});
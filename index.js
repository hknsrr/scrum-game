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

    function encodeHTML(str) {
        str = String(str);
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function isWithinRange(number, average, tolerance) {
        return number >= average - tolerance && number <= average + tolerance;
    }

    socket.on('joinRoom', ({ room, name, isMaster }) => {

        room = encodeHTML(room);
        name = encodeHTML(name);

        socket.join(room);
        if (!rooms[room]) rooms[room] = { master: null, users: {} };

        if (isMaster) {
            rooms[room].master = socket.id;
        }

        rooms[room].users[socket.id] = { name, vote: null };

        io.to(room).emit('updateUsers', rooms[room].users);
    });

    socket.on('vote', ({ room, vote }) => {

        room = encodeHTML(room);
        vote = encodeHTML(vote);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].vote = vote;

            // // Eğer tüm kullanıcılar oy kullandıysa Scrum Master'a bildir
            // if (Object.values(rooms[room].users).every(user => user.vote !== null)) {
            //     io.to(rooms[room].master).emit('allVoted');
            // }

            // Kullanıcıların güncellenmiş listesini gönder
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });


    socket.on('showVotes', (room) => {

        room = encodeHTML(room);

        if (rooms[room] && socket.id === rooms[room].master) {

            const users = rooms[room].users;
            let totalVotes = 0;
            let userCount = 0;

            for (const userId in users) {
                if (users.hasOwnProperty(userId)) {
                    if (!isNaN(users[userId].vote) && users[userId].vote) {
                        totalVotes += parseFloat(users[userId].vote, 2);
                        userCount++;
                    }
                }
            }

            const averageVote = userCount > 0 ? totalVotes / userCount : 0;

            for (const userId in users) {
                if (users.hasOwnProperty(userId)) {

                    const average = averageVote;
                    const tolerance = 0.75;
                    const newNumber = users[userId].vote;

                    if (isWithinRange(newNumber, average, tolerance)) {
                        users[userId].isWinner = true;
                    } else {
                        users[userId].isWinner = false;
                    }

                }
            }

            io.to(room).emit('updateVotes', rooms[room].users, averageVote.toFixed(2));
        }
    });

    socket.on('pulseDetect', (room) => {

    });

    socket.on('a', (room) => {

        room = encodeHTML(room);

        if (rooms[room]) {
            for (let userId in rooms[room].users) {
                rooms[room].users[userId].vote = null;
            }
            io.to(room).emit('a', rooms[room].users);
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

        room = encodeHTML(room);

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

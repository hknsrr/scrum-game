const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    pingTimeout: 60000,      // 60 saniye cevap yoksa disconnect
    pingInterval: 25000,     // Her 25 saniyede sunucu ping gönderir
    connectTimeout: 45000,   // Bağlantı timeout'u
    upgradeTimeout: 30000,   // WebSocket upgrade timeout'u
});

let rooms = {};
let disconnectTimers = {}; // Track disconnect timers for 5-minute grace period

const PORT = process.env.PORT || 3000;
const AWAY_GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes in milliseconds

app.use(express.static(path.join(__dirname, '/')));

io.on('connection', (socket) => {

    function encodeHTML(str) {
        str = String(str);
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function isWithinRange(number, average, tolerance) {
        return number >= average - tolerance && number <= average + tolerance;
    }

    socket.on('joinRoom', ({ room, name, isMaster, avatar }) => {

        room = encodeHTML(room);
        name = encodeHTML(name);
        avatar = encodeHTML(avatar || '👤');

        socket.join(room);
        if (!rooms[room]) rooms[room] = { master: null, users: {} };

        // Check if user with same name exists (reconnection scenario)
        let existingUserId = null;
        let existingUserData = null;

        for (let userId in rooms[room].users) {
            if (rooms[room].users[userId].name === name) {
                existingUserId = userId;
                existingUserData = rooms[room].users[userId];
                break;
            }
        }

        // If reconnecting, restore previous state and cancel disconnect timer
        if (existingUserId && existingUserData) {
            // Cancel disconnect timer if exists
            if (disconnectTimers[existingUserId]) {
                clearTimeout(disconnectTimers[existingUserId]);
                delete disconnectTimers[existingUserId];
            }

            // Remove old user entry
            delete rooms[room].users[existingUserId];

            // Restore state with new socket ID
            rooms[room].users[socket.id] = {
                ...existingUserData,
                isAway: false, // User is back, clear away status
                isMaster: isMaster,
                avatar: avatar // Update avatar on reconnection
            };

            console.log(`User ${name} reconnected to room ${room}`);
        } else {
            // New user joining
            rooms[room].users[socket.id] = {
                name,
                vote: null,
                requestBreak: false,
                hasQuestion: false,
                isAway: false,
                isMaster: isMaster,
                avatar: avatar
            };
        }

        if (isMaster) {
            rooms[room].master = socket.id;
        }

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
            let validVotes = []; // Numeric votes only (excluding coffee, away, null)

            // Collect valid numeric votes
            for (const userId in users) {
                if (users.hasOwnProperty(userId)) {
                    const vote = users[userId].vote;
                    const isAway = users[userId].isAway;
                    // Check if vote is numeric, not away, not coffee
                    if (!isNaN(vote) && vote !== null && vote !== '' && !isAway && vote !== '☕') {
                        const numericVote = Number(vote);
                        validVotes.push(numericVote);
                        totalVotes++;
                    }
                }
            }

            // Calculate statistics
            let average = 0;
            let mostCommon = 0;
            let consensus = 0;

            if (validVotes.length > 0) {
                // Calculate average
                const sum = validVotes.reduce((a, b) => a + b, 0);
                average = (sum / validVotes.length).toFixed(1);

                // Calculate most common vote (mode)
                const voteCounts = {};
                validVotes.forEach(vote => {
                    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
                });

                // Find the most common vote(s)
                const maxCount = Math.max(...Object.values(voteCounts));
                const mostCommonVotes = Object.keys(voteCounts).filter(vote => voteCounts[vote] === maxCount);

                // If there's a tie, show all tied values
                if (mostCommonVotes.length === 1) {
                    mostCommon = mostCommonVotes[0];
                } else {
                    mostCommon = mostCommonVotes.join(', ');
                }

                // Calculate consensus (percentage of most common vote)
                consensus = Math.round((maxCount / validVotes.length) * 100);
            }

            // Send statistics to client
            const statistics = {
                average: average || '-',
                median: mostCommon || '-',
                consensus: validVotes.length > 0 ? `${consensus}%` : '-'
            };

            io.to(room).emit('updateVotes', rooms[room].users, totalVotes, statistics);
        }
    });

    socket.on('pulseDetect', (room) => {
        io.to(room).emit('pulseDetected'); 
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
                const user = rooms[room].users[socket.id];

                // Mark user as away immediately
                rooms[room].users[socket.id].isAway = true;
                io.to(room).emit('updateUsers', rooms[room].users);

                console.log(`User ${user.name} disconnected from room ${room}, starting 5-min grace period`);

                // Set 5-minute timer before removing user
                disconnectTimers[socket.id] = setTimeout(() => {
                    console.log(`Grace period expired for ${user.name}, removing from room ${room}`);

                    // Check if user still exists and hasn't reconnected
                    if (rooms[room] && rooms[room].users[socket.id]) {
                        delete rooms[room].users[socket.id];
                        io.to(room).emit('updateUsers', rooms[room].users);
                    }

                    // Clean up timer reference
                    delete disconnectTimers[socket.id];
                }, AWAY_GRACE_PERIOD);
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

    socket.on('breakRequest', ({ room, requestBreak }) => {

        room = encodeHTML(room);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].requestBreak = requestBreak;
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });

    socket.on('question', ({ room, hasQuestion }) => {

        room = encodeHTML(room);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].hasQuestion = hasQuestion;
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });

    socket.on('autoAway', ({ room, isAway }) => {

        room = encodeHTML(room);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].isAway = isAway;
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });

});

server.listen(PORT, () => {
    console.log('Server listening on port 3000');
});

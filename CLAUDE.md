# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time Scrum Planning Poker application built with Express.js, Socket.io, and vanilla JavaScript. It enables distributed teams to conduct agile estimation sessions in real-time through a web interface.

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run in production mode
npm start
```

The server runs on port 3000 by default (configurable via PORT environment variable).

## Architecture

### Server-Side (index.js)
- **Express Server**: Serves static files from the root directory
- **Socket.io Server**: Manages real-time WebSocket connections
- **Room Management**: In-memory storage using `rooms` object with structure:
  ```javascript
  {
    [roomName]: {
      master: socketId,  // Scrum master's socket ID
      users: {
        [socketId]: { name, vote, isWinner }
      }
    }
  }
  ```

### Client-Side (index.html)
- **Single-page application** with embedded JavaScript and CSS
- **Socket.io client** connects to server and manages real-time updates
- **Two main sections**:
  - Join Section: Room entry with name, room ID, and Scrum Master checkbox
  - Game Section: Voting interface with Fibonacci sequence (0,1,2,3,5,8,13,21) and special votes (coffee, wc, away)

### Key Socket Events

**Client → Server:**
- `joinRoom`: User joins a room with name and role
- `vote`: User submits their estimate
- `showVotes`: Scrum master reveals all votes
- `resetVotes`: Scrum master resets voting session
- `pulseDetect`: Heartbeat sent every 5 seconds to maintain connection

**Server → Client:**
- `updateUsers`: Broadcast updated user list (shows who voted)
- `updateVotes`: Broadcast revealed votes with winners
- `votesReset`: Broadcast reset state
- `pulseDetected`: Heartbeat acknowledgment

### Security Features
- HTML encoding on all user inputs (room names, usernames, votes) via `encodeHTML()` function
- Prevents XSS attacks by sanitizing data before processing

### Important Implementation Details

1. **Role Separation**: Only the Scrum Master (identified by `isMaster` flag) can reveal votes and reset sessions. Master's socket ID is stored in `rooms[room].master`.

2. **Vote State Management**: User cards show visual feedback:
   - Green border (`.voted` class) when user has submitted a vote
   - Vote remains hidden until Scrum Master reveals
   - Active button styling shows user's current selection

3. **Winner Calculation**: The `isWithinRange()` function on server determines winners (currently has a bug - missing `average` parameter in call at line 86).

4. **Disconnection Handling**: Server automatically removes disconnected users from rooms and broadcasts updated user list.

5. **No Persistence**: All data is in-memory. Rooms and votes are lost on server restart.

## Working Directory Structure

The actual application files are located in the `scrum-game/` subdirectory, not the root. When running commands or referencing files, ensure you're in the correct directory.

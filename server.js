const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve your HTML and JavaScript files here
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const Room = class {
  constructor(user_id, codenames) {
    this.members = [user_id];
    this.codenames = codenames;
  }
};

// Store the room data, including 25 random lines
const room_data = {};

// Function to get 25 random lines from an array
function getRandomLines(array) {
  const shuffled = array.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 25);
}

io.on('connection', (socket) => {
  console.log('A user connected.');

  let cur_user_id = "";
  let cur_room_id = "";

  socket.on('joinRoom', (dataObject) => {
    prev_user_id = cur_user_id;
    prev_room_id = cur_room_id;
    cur_user_id = dataObject.user_id;
    cur_room_id = dataObject.room_id;

    console.log(`${prev_user_id}@${prev_room_id} to ${cur_user_id}@${cur_room_id}`);

    if (room_data[prev_room_id]) {
      room_data[prev_room_id].members = room_data[prev_room_id].members.filter((m) => m != prev_user_id);
    }

    if (!room_data[cur_room_id]) {
      console.log(`room [${cur_room_id}] is new and will be created.`);
      const data = fs.readFileSync('public/original.txt', 'utf8');
      const lines = data.split('\n');
      const randomLines = getRandomLines(lines);
      room_data[cur_room_id] = new Room(cur_user_id, randomLines);
    } else {
      console.log(`room [${cur_room_id}] already exists, and will be updated.`);
      if (!room_data[cur_room_id].members.includes(cur_user_id)) {
        room_data[cur_room_id].members.push(cur_user_id);
      }
    }

    if (room_data[prev_room_id]) {
      if (room_data[prev_room_id].members.length == 0) {
        console.log(`room [${prev_room_id}] is empty and will be deleted.`);
        delete room_data[prev_room_id];
      }
    }

    io.emit('message', {'user_id': 'ANNOUNCEMENT', 'message': `A user [${cur_user_id}] joined your room [${cur_room_id}]`});
    socket.emit('roomData', room_data[cur_room_id].codenames);
  });

  socket.on('disconnect', (dwa) => {
    io.emit('message', {'user_id': 'ANNOUNCEMENT', 'message': `A user [${cur_user_id}] left your room [${cur_room_id}]`});
    console.log(`A user [${cur_user_id}] disconnected.`);   
  });

});

server.listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});

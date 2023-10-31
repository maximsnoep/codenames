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
  constructor(id, codenames) {
    this.id = id;
    this.members = [];
    this.codenames = codenames;
  }

  add_user(id) {
    if (this.members.includes(id)) {
      console.log(`! ROOM[ ${this.id} ] already includes USER[ ${id} ]`);
    } else {
      this.members.push(id);
    }
  }

  remove_user(id) {
    if (!this.members.includes(id)) {
      console.log(`! ROOM[ ${this.id} ] did not even include USER[ ${id} ]`);
    } else {
      this.members = this.members.filter((m) => m != id);
    }
  }

};

const Rooms = class {
  constructor() {
    this.rooms = {};
  }

  add_room(room) {
    console.log(`> create ROOM[ ${room.id} ]`);
    this.rooms[room.id] = room;
  }

  user_exists_in_room(user_id, room_id) {
    return this.room_exists(room_id) && this.rooms[room_id].members.includes(user_id)
  }

  room_exists(id) {
    return this.rooms[id]
  }

  remove_room(id) {
    if (id == null) { return }
    console.log(`> remove ROOM[ ${id} ]`);
    delete this.rooms[id];
  }

  add_user_to_room(user_id, room_id) {
    if (user_id == null || room_id == null) { return }
    console.log(`> add USER[ ${user_id} ] to ROOM[ ${room_id} ] `);
    this.rooms[room_id].add_user(user_id);
  }

  remove_user_from_room(user_id, room_id) {
    if (user_id == null || room_id == null) { return }
    console.log(`> remove USER[ ${user_id} ] from ROOM[ ${room_id} ] `);
    this.rooms[room_id].remove_user(user_id);
  }

  remove_empty_rooms() {
    for (const id of Object.entries(this.rooms).filter(([_, room]) => room.members.length == 0).map(([id, _]) => id)) {
      this.remove_room(id);
    }
  }

}

const rooms = new Rooms();


io.on('connection', (socket) => {
  console.log('A user connected.');

  let new_user_id = null;
  let new_room_id = null;

  socket.on('joinRoom', (dataObject) => {

    if (rooms.user_exists_in_room(dataObject.user_id, dataObject.room_id)) {
      return
    }

    prev_user_id = new_user_id;
    prev_room_id = new_room_id;
    new_user_id = dataObject.user_id;
    new_room_id = dataObject.room_id;

    console.log(`--> ${prev_user_id}@${prev_room_id} to ${new_user_id}@${new_room_id}`);

    rooms.remove_user_from_room(prev_user_id, prev_room_id);
    socket.leave(prev_room_id);

    if (!rooms.room_exists(new_room_id)) {
      const data = fs.readFileSync('public/original.txt', 'utf8');
      const randomLines = data.split('\n').sort(() => 0.5 - Math.random())
      const randomLines25 = randomLines.slice(0, 25);
      rooms.add_room(new Room(new_room_id, randomLines25));
    }

    rooms.add_user_to_room(new_user_id, new_room_id);
    socket.join(new_room_id);

    rooms.remove_empty_rooms();

    io.to(prev_room_id).emit('message', {'user_id': '!', 'message': `ANNOUNCEMENT: A user [${prev_user_id}] left your room [${prev_room_id}]`});
    io.to(new_room_id).emit('message', {'user_id': '!', 'message': `ANNOUNCEMENT: A user [${new_user_id}] joined your room [${new_room_id}]`});

    socket.emit('roomData', rooms.rooms[new_room_id].codenames);

  });

  socket.on('disconnect', () => {
    
    rooms.remove_user_from_room(new_user_id, new_room_id);
    io.to(new_room_id).emit('message', {'user_id': '!', 'message': `ANNOUNCEMENT: A user [${new_user_id}] left your room [${new_room_id}]`});

    console.log(`A user [${new_user_id}] disconnected.`);   
  });

});

server.listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});

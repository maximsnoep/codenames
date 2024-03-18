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

server.listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});



const Room = class {
  constructor(id, codenames, coloring) {
    this.id = id;
    this.members = [];
    this.admins = [];
    this.codenames = [];
    this.coloring = [];
    this.revealed = [];
  }

  // member management
  is_member(id) { return this.members.includes(id); }
  add_user(id) { !this.is_member(id) && this.members.push(id); }
  remove_user(id) { this.members = this.members.filter((m) => m != id); }

  // admin management
  is_admin(id) { return this.admins.includes(id); }
  add_admin(id) { if (this.is_member(id) && !this.is_admin(id)) this.admins.push(id); }
  remove_admin(id) { this.admins = this.admins.filter((m) => m != id); }

  // game management
  reveal_card(id) { this.revealed[id] = true; }
  fill() {
    this.codenames = fs.readFileSync('public/original.txt', 'utf8').split('\n').sort(() => 0.5 - Math.random()).slice(0, 25);
    // assassin is coloring[0]
    // red cards is coloring[1..9]
    // blue cards is coloring[10..18]
    // neutral is coloring[19..25]
    this.coloring = [...Array(25).keys()].sort(() => 0.5 - Math.random());
    this.revealed = Array(25).fill(false);
  }

};

const RoomManager = class {
  constructor() {
    this.rooms = {};
  }

  remove_empty_rooms() {
    for (const id of Object.entries(this.rooms).filter(([_, room]) => room.members.length == 0).map(([id, _]) => id)) {
      id && delete this.rooms[id];
    }
  }

  // user management
  is_user_in_room(user_id, room_id) { return this.room_exists(room_id) && this.rooms[room_id].is_member(user_id); }

  // admin management
  is_admin_in_room(user_id, room_id) { return this.rooms[room_id] && this.rooms[room_id].is_admin(user_id); }

  add_admin_to_room(admin_id, user_id, room_id) {
    if (user_id == null || room_id == null) { return }
    if (!this.is_admin_in_room(admin_id, room_id) && this.rooms[room_id].admins.length > 0) { return }
    this.rooms[room_id].add_user(user_id);
    this.rooms[room_id].add_admin(user_id);
  }

  remove_admin_from_room(admin_id, user_id, room_id) {
    if (user_id == null || room_id == null) { return }
    if (!this.is_admin_in_room(admin_id, room_id)) { return }
    this.rooms[room_id].remove_admin(user_id);

    for (const id of Object.entries(this.rooms).filter(([_, room]) => room.admins.length == 0).map(([id, _]) => id)) {
      room_manager.add_admin_to_room("mr. bunny", this.rooms[id].members[0], id);
    }
  }


  // game management
  reveal_card(room_id, card_id) {
    if (room_id == null || card_id == null) { return }
    this.rooms[room_id].reveal_card(card_id);
  }
  
}



const room_manager = new RoomManager();

io.on('connection', (socket) => {

  console.log(`A socket [${socket.id}] connected.`);

  var user_id;
  var room_id;
  
  function leave_room() {
    if (user_id && room_id) console.log(`<${user_id}> left <${room_id}>`);  
    if (user_id && room_id) room_manager.rooms[room_id].remove_user(user_id);
    if (user_id && room_id) room_manager.remove_admin_from_room(user_id, user_id, room_id);
    room_manager.remove_empty_rooms();

    socket.leave(room_id);
    io.to(room_id).emit('roomUpdate', {"user": user_id, "data": room_manager.rooms[room_id]});
  }

  function join_room() {
    if (!room_manager.rooms[room_id]) {
      console.log(`<${user_id}> created <${room_id}>`);
      room_manager.rooms[room_id] = new Room(room_id)
      room_manager.rooms[room_id].fill();
      room_manager.add_admin_to_room("mr. bunny", user_id, room_id);
    } else {
      console.log(`<${user_id}> joined <${room_id}>`);
      if (user_id && room_id) room_manager.rooms[room_id].add_user(user_id);
    }
 
    socket.join(room_id);
    io.to(room_id).emit('roomUpdate', {"user": user_id, "data": room_manager.rooms[room_id]});
  }

  

  socket.on('joinRoom', (dataObject) => {
    leave_room();
    room_id = dataObject.room_id;
    user_id = dataObject.user_name + "#" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    join_room();       
  });

  socket.on('makeAdmin', (user_to_be_made_admin) => {
    if (user_id != user_to_be_made_admin && room_manager.is_admin_in_room(user_to_be_made_admin, room_id)){
      room_manager.remove_admin_from_room(user_id, user_to_be_made_admin, room_id);
    } else {
      room_manager.add_admin_to_room(user_id, user_to_be_made_admin, room_id);
    }
    
    io.to(room_id).emit('roomUpdate', {"user": user_id, "data": room_manager.rooms[room_id]});
  });

  socket.on('disconnect', () => {
    leave_room()
  });

  socket.on('revealCards', (card_ids) => {
    for (const card_id of card_ids) {
      room_manager.reveal_card(room_id, card_id);
    }
    io.to(room_id).emit('roomUpdate', {"user": user_id, "data": room_manager.rooms[room_id]});
  });

  socket.on('reinitGame', () => {
    room_manager.rooms[room_id].fill();
    io.to(room_id).emit('roomUpdate', {"user": user_id, "data": room_manager.rooms[room_id]});
  });

});




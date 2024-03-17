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
    this.codenames = codenames;
    this.coloring = coloring;
  }

  is_member(id) { return this.members.includes(id); }

  add_user(id) { 
    if (!this.is_member(id)) {
      this.members.push(id);
    }
  }

  remove_user(id) {
    if (this.is_member(id)) {
      this.members = this.members.filter((m) => m != id);
    }
  }

  is_admin(id) { return this.admins.includes(id); }

  add_admin(id) {
    if (this.is_member(id) && !this.is_admin(id)) {
      this.admins.push(id);
    }
  }

  remove_admin(id) {
    if (this.is_admin(id)) {
      this.admins = this.admins.filter((m) => m != id);
    }
  }

};

const RoomManager = class {
  constructor() {
    this.rooms = {};
  }

  is_room(id) { return this.rooms[id]; }

  add_room(room) { this.rooms[room.id] = room; }

  remove_room(id) {
    if (id == null) { return }
    delete this.rooms[id];
  }



  is_user_in_room(user_id, room_id) { return this.room_exists(room_id) && this.rooms[room_id].is_member(user_id); }

  add_user_to_room(user_id, room_id) {
    if (user_id == null || room_id == null) { return }
    this.rooms[room_id].add_user(user_id);
  }

  remove_user_from_room(user_id, room_id) {
    if (user_id == null || room_id == null) { return }
    this.rooms[room_id].remove_user(user_id);
  }



  is_admin_in_room(user_id, room_id) { return this.is_room(room_id) && this.rooms[room_id].is_admin(user_id); }

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

    console.log(this.rooms[room_id].admins)

    for (const id of Object.entries(this.rooms).filter(([_, room]) => room.admins.length == 0).map(([id, _]) => id)) {
      console.log(this.rooms[id]);
      room_manager.add_admin_to_room("mr. bunny", this.rooms[id].members[0], id);
    }
  }



  remove_empty_rooms() {
    for (const id of Object.entries(this.rooms).filter(([_, room]) => room.members.length == 0).map(([id, _]) => id)) {
      this.remove_room(id);
    }
  }
  
}



const room_manager = new RoomManager();

io.on('connection', (socket) => {

  var user_id = socket.id;
  var room_id = "bunny";
  var user_name = "incognito";

  console.log(`A user [${format_user()}] connected.`);   

  function format_user() {
    return user_name+"#"+user_id.slice(0,5);
  }
  
  function leave_room() {
    room_manager.remove_user_from_room(format_user(), room_id);
    
    socket.leave(room_id);
    io.to(room_id).emit('announcement', {'message': `A user [${format_user()}] left your room [${room_id}]`});
    io.to(room_id).emit('roomUpdate', room_manager.rooms[room_id]);
  }

  function join_room() {
    if (!room_manager.is_room(room_id)) {
      const data = fs.readFileSync('public/original.txt', 'utf8');
      const codenames = data.split('\n').sort(() => 0.5 - Math.random()).slice(0, 25);
      // assassin is coloring[0]
      // red cards is coloring[1..9]
      // blue cards is coloring[10..18]
      // neutral is coloring[19..25]
      const coloring = [...Array(25).keys()].sort(() => 0.5 - Math.random())
      room_manager.add_room(new Room(room_id, codenames, coloring));
      room_manager.add_admin_to_room("mr. bunny", format_user(), room_id);

    } else {
      room_manager.add_user_to_room(format_user(), room_id);
    }
    
    socket.emit('userUpdate', {"user": format_user(), "room": room_id});

    socket.join(room_id);

    io.to(room_id).emit('announcement', {'message': `A user [${format_user()}] joined your room [${room_id}]`});
    io.to(room_id).emit('roomUpdate', room_manager.rooms[room_id]);
  }

  join_room();

  socket.on('joinRoom', (dataObject) => {

    leave_room();

    room_id = dataObject.room_id;
    user_name = dataObject.user_name;
    join_room();   

    room_manager.remove_empty_rooms();

  });

  socket.on('makeAdmin', (user_to_be_made_admin) => {

    if (format_user() != user_to_be_made_admin && room_manager.is_admin_in_room(user_to_be_made_admin, room_id)){
      room_manager.remove_admin_from_room(format_user(), user_to_be_made_admin, room_id);
    } else {
      room_manager.add_admin_to_room(format_user(), user_to_be_made_admin, room_id);
    }
    
    io.to(room_id).emit('roomUpdate', room_manager.rooms[room_id]);
  });

  socket.on('disconnect', () => {
    console.log(`A user [${format_user()}] disconnected.`);   
    leave_room()

    room_manager.remove_admin_from_room(format_user(), format_user(), room_id);
    room_manager.remove_empty_rooms();

  });

});




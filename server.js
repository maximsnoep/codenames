const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// serve all files in /public as static files
app.use(express.static("public"));

server.listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});

const Game = class {
  constructor(wordList) {
    this.codenames = fs.readFileSync(`public/wordlists/${wordList}.txt`, 'utf8').split('\n').sort(() => 0.5 - Math.random()).slice(0, 25);
    // assassin is coloring[0]
    // red cards is coloring[1..9]
    // blue cards is coloring[10..18]
    // neutral is coloring[19..25]
    this.coloring = [...Array(25).keys()].sort(() => 0.5 - Math.random());
    this.revealed = Array(25).fill(false);
    this.current = "red";
  }

  reveal(id) {
    let index = this.coloring.indexOf(parseInt(id));

    if (this.current == "red") {
      if ((index >= 10 && index <= 17) || (index >= 18)) {
          this.current = "blue";
      }
    } else if (this.current == "blue") {
      if ((index >= 1 && index <= 9) || (index >= 18)) {
          this.current = "red";
      }
    }
    
    this.revealed[id] = true;
  }

  state() {
    let assassin = 0;
    let red = 0;
    let blue = 0;
    let neutral = 0;
    let revealed = 0;
    for (let i = 0; i < this.revealed.length; i++) {
      let index = this.coloring.indexOf(i);
      if (this.revealed[i]) {
          if (index === 0) {
              assassin += 1;
          }
          if (index >= 1 && index <= 9) {
              red += 1;
          }
          if (index >= 10 && index <= 17) {
              blue += 1;
          }
          if (index >= 18) {
              neutral += 1;
          }
          revealed += 1;
      }
    }

    let assassin_win = assassin == 1;
    let red_win = red == 9;
    let blue_win = blue == 8;
    if (assassin_win && !red_win && !blue_win) {
      this.current = "over";
      return 0;
    } else if (red_win && !blue_win && !assassin_win) {
      this.current = "over";
      return 1;
    } else if (blue_win && !red_win && !assassin_win) {
      this.current = "over";
      return 2;
    } else {    
      return -1;
    }
  }

}


const Member = class {
  constructor(name) {
    this.name = name;
    this.admin = false;
  }
}

const Room = class {
  constructor(id) {
    this.id = id;
    this.members = {};
    this.game = new Game('theroom');
  }

  // member management
  is_member(id) { return id in this.members; }
  add_member(id, m) { this.members[id] = m; }
  del_member(id) { delete this.members[id]; }
  num_members() { return Object.keys(this.members).length; }

  // admin management
  is_admin(id) { return this.is_member(id) && this.members[id].admin }
  add_admin(id) { if (this.is_member(id)) this.members[id].admin = true; }
  del_admin(id) { if (this.is_member(id)) this.members[id].admin = false; }
  num_admins() { return Object.keys(this.members).filter(id => this.members[id].admin).length };

};

const RoomManager = class {
  constructor() {
    this.rooms = {};
  }

  remove_empty_rooms() {
    for (const id of Object.entries(this.rooms).filter(([_, room]) => room.num_members() == 0).map(([id, _]) => id)) {
      id && delete this.rooms[id];
    }
  }

  // room management
  is_room(id) { return id in this.rooms; }

  // user management
  is_member_in_room(user_id, room_id) { return this.is_room(room_id) && this.rooms[room_id].is_member(user_id); }
  is_admin_in_room(user_id, room_id) { return this.is_room(room_id) && this.rooms[room_id].is_admin(user_id); }
  
}

const room_manager = new RoomManager();

io.on('connection', (socket) => {

  console.log(`A socket [${socket.id}] connected.`);

  let files = fs.readdirSync('./public/wordlists/');
  files = files.map(f => path.parse(f).name);
  io.to(socket.id).emit('wordlistUpdate', files);

  function update(room_id) {
    io.to(room_id).emit('roomUpdate', room_manager.rooms[room_id]);
  }

  function join_room(room_id, user_name) {
    if (!room_id || !user_name) return;

    if (!room_manager.is_room(room_id)) {
      console.log(`${socket.id} (${user_name}) created <${room_id}>`);
      room_manager.rooms[room_id] = new Room(room_id);
      room_manager.rooms[room_id].add_member(socket.id, new Member(user_name));
      room_manager.rooms[room_id].add_admin(socket.id);
    } else {
      console.log(`${socket.id} (${user_name}) joined <${room_id}>`);
      room_manager.rooms[room_id].add_member(socket.id, new Member(user_name));
    }

    socket.join(room_id);
    update(room_id);
  }

  function leave_room() {
    for (const room_id of Object.keys(room_manager.rooms)) {
      if (room_manager.rooms[room_id].is_member(socket.id)) {
        console.log(`<${socket.id}> left <${room_id}>`);
        room_manager.rooms[room_id].del_member(socket.id);
        if (room_manager.rooms[room_id].num_members() > 0 && room_manager.rooms[room_id].num_admins() == 0) {
          room_manager.rooms[room_id].add_admin(Object.keys(room_manager.rooms[room_id].members)[0]);
        }
        socket.leave(room_id);
        update(room_id);
      }
    }
    room_manager.remove_empty_rooms();
  }

  socket.on('disconnect', () => {
    leave_room()
  });

   socket.on('joinRoom', (dataObject) => { 
    leave_room();
    let user_name = dataObject.user_name + "-" + Math.floor(Math.random() * 1000);
    join_room(dataObject.room_id.toLowerCase(), user_name.toLowerCase());
  });

  socket.on('toggleAdmin', (user_id) => {
    for (const room_id of Object.keys(room_manager.rooms)) {
      if (!room_manager.is_member_in_room(socket.id, room_id)) { return }
      if (!room_manager.is_admin_in_room(socket.id, room_id)) { return }
      room_manager.rooms[room_id].members[user_id].admin = !room_manager.rooms[room_id].members[user_id].admin;
      if (room_manager.rooms[room_id].num_admins() == 0) { 
        room_manager.rooms[room_id].add_admin(user_id);	
      }
      update(room_id);
    }
  });

  socket.on('revealCards', (cards) => {
    for (const room_id of Object.keys(room_manager.rooms)) {
      if (!room_manager.is_member_in_room(socket.id, room_id)) { return }
      if (!room_manager.is_admin_in_room(socket.id, room_id)) { return }
      let state = room_manager.rooms[room_id].game.state();
      let current = room_manager.rooms[room_id].game.current;
      for (const card of cards) {
        room_manager.rooms[room_id].game.reveal(card);
      }
      let new_state = room_manager.rooms[room_id].game.state();

      update(room_id);
      
      if (state == -1) {
        if (new_state == 0 && current == "red") {
          io.to(room_id).emit('gameOver', 'blue-assassin');
        } else if (new_state == 0 && current == "blue") {
          io.to(room_id).emit('gameOver', 'red-assassin');
        } else if (new_state == 1) {
          io.to(room_id).emit('gameOver', 'red');
        } else if (new_state == 2) {
          io.to(room_id).emit('gameOver', 'blue');
        }
      }
    }
  });

  socket.on('reinitGame', (wordList) => {
    for (const room_id of Object.keys(room_manager.rooms)) {
      if (!room_manager.is_member_in_room(socket.id, room_id)) { return }
      if (!room_manager.is_admin_in_room(socket.id, room_id)) { return }
      room_manager.rooms[room_id].game = new Game(wordList);
      update(room_id);
    }
  });

  socket.on('next', () => {
    for (const room_id of Object.keys(room_manager.rooms)) {
      if (!room_manager.is_member_in_room(socket.id, room_id)) { return }
      if (!room_manager.is_admin_in_room(socket.id, room_id)) { return }
      if (room_manager.rooms[room_id].game.state() != -1) { return }
      room_manager.rooms[room_id].game.current = room_manager.rooms[room_id].game.current == "red" ? "blue" : "red";
      update(room_id);
    }
  });

});

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const WORDLIST_DIR = path.join(__dirname, "public", "wordlists");

// serve all files in /public as static files
app.use(express.static("public"));

server.listen(8080, () => {
	console.log("Codenames is running on http://localhost:8080");
});

const CHECK_INTERVAL = 5; // seconds
const INACTIVE_TIMEOUT = 30 * 1000; // milliseconds

// Periodic Check to Remove Inactive Users
setInterval(() => {
	console.log(
		`Currently active users: ${Object.keys(activeUsers).length}. Checking for inactive users.`,
	);
	Object.keys(activeUsers).forEach((userID) => {
		const user = activeUsers[userID];
		if (!user) return;

		if (user.disconnectedAt !== null) {
			if (Date.now() - user.disconnectedAt >= INACTIVE_TIMEOUT) {
				removeInactiveUser(userID, "disconnect timeout");
			}
			return;
		}

		user.missedPings += 1;
		if (user.missedPings * CHECK_INTERVAL * 1000 >= INACTIVE_TIMEOUT) {
			removeInactiveUser(userID, "missed ping timeout");
		} else {
			io.to(user.socketID).emit("ping"); // Ask for response
		}
	});
}, CHECK_INTERVAL * 1000);

function getAvailableWordlists() {
	return fs
		.readdirSync(WORDLIST_DIR)
		.filter((file) => path.extname(file) === ".txt")
		.map((file) => path.parse(file).name);
}

function getSelectedWordlists(wordLists) {
	const requested = Array.isArray(wordLists) ? wordLists : [wordLists];
	const available = new Set(getAvailableWordlists());
	const selected = requested.filter(
		(list) => typeof list === "string" && available.has(list),
	);

	if (selected.length > 0) {
		return selected;
	}
	return available.has("original")
		? ["original"]
		: [getAvailableWordlists()[0]];
}

function shuffle(items) {
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

function loadWords(wordLists) {
	const words = [];
	const seen = new Set();

	wordLists.forEach((wordList) => {
		fs.readFileSync(path.join(WORDLIST_DIR, `${wordList}.txt`), "utf8")
			.split(/\r?\n/)
			.map((word) => word.trim())
			.filter(Boolean)
			.forEach((word) => {
				const key = word.toLowerCase();
				if (!seen.has(key)) {
					seen.add(key);
					words.push(word);
				}
			});
	});

	if (words.length < 25) {
		throw new Error(
			`Selected wordlists only contain ${words.length} unique words.`,
		);
	}

	return shuffle(words).slice(0, 25);
}

const Game = class {
	constructor(wordLists, assassin) {
		this.wordLists = getSelectedWordlists(wordLists);
		this.codenames = loadWords(this.wordLists);
		// assassin is coloring[0]
		// red cards is coloring[1..9]
		// blue cards is coloring[10..18]
		// neutral is coloring[19..25]
		this.coloring = shuffle([...Array(25).keys()]);
		this.revealed = Array(25).fill(false);
		this.current = "red";
		this.over = false;
		this.assassin = assassin;
		this.turnStart = Date.now();

		console.log(
			`GAME: Initialized with\n  wordlists: ${this.wordLists.join(", ")}\n  codenames: ${this.codenames}\n  coloring: ${this.coloring}\n  assassin: ${this.assassin}\n`,
		);
	}

	reveal(id) {
		if (this.revealed[id]) {
			return;
		}

		let prev = this.current;
		let color = this.coloring.indexOf(parseInt(id));
		if (this.current == "red") {
			if ((color >= 10 && color <= 17) || color >= 18) {
				this.current = "blue";
			}
		} else if (this.current == "blue") {
			if ((color >= 1 && color <= 9) || color >= 18) {
				this.current = "red";
			}
		}

		if (this.current !== prev) {
			this.turnStart = Date.now();
		}

		this.revealed[id] = true;

		console.log(`GAME: Revealed card ${id} (${this.codenames[id]}).`);
	}

	state() {
		if (this.over) {
			return -1;
		}

		let counts = { assassin: 0, red: 0, blue: 0, neutral: 0, revealed: 0 };
		for (let i = 0; i < this.revealed.length; i++) {
			if (!this.revealed[i]) {
				continue;
			}
			let index = this.coloring.indexOf(i);

			if (index === 0 && this.assassin) {
				counts.assassin += 1;
			}
			if (index === 0 && !this.assassin) {
				counts.neutral += 1;
			}
			if (index >= 1 && index <= 9) {
				counts.red += 1;
			}
			if (index >= 10 && index <= 17) {
				counts.blue += 1;
			}
			if (index >= 18) {
				counts.neutral += 1;
			}
		}

		if (counts.assassin === 1) {
			if (this.current === "red") {
				this.current = "blue-assassin";
				this.over = true;
				return -1;
			}
			if (this.current === "blue") {
				this.current = "red-assassin";
				this.over = true;
				return -1;
			}
		}
		if (counts.blue === 8) {
			this.current = "blue";
			this.over = true;
			return -1;
		}
		if (counts.red === 9) {
			this.current = "red";
			this.over = true;
			return -1;
		}
		return 0;
	}

	next() {
		if (this.state() == -1) {
			return;
		}
		console.log(`state: ${this.state()}`);
		console.log(`GAME: Next turn.`);
		console.log(`GAME: Current turn is ${this.current}.`);
		this.current = this.current == "red" ? "blue" : "red";
		this.turnStart = Date.now();
		console.log(`GAME: Next turn is ${this.current}.`);
	}
};

const Member = class {
	constructor(name) {
		this.name = name;
		this.admin = false;
		this.number = 0; // per-name join number, assigned by the room on add
	}
};

const Room = class {
	constructor(id) {
		this.id = id;
		this.members = {};
		// How many members have EVER joined with each base name. Persists for
		// the life of the room so numbers stay stable when members leave.
		this.name_counts = {};
		this.timerEnabled = true;
		this.game = new Game("original", true);
	}

	// member management
	is_member(id) {
		return id in this.members;
	}
	add_member(id, m) {
		const count = (this.name_counts[m.name] || 0) + 1;
		this.name_counts[m.name] = count;
		m.number = count;
		this.members[id] = m;
	}
	del_member(id) {
		delete this.members[id];
	}
	num_members() {
		return Object.keys(this.members).length;
	}

	// admin management
	is_admin(id) {
		return this.is_member(id) && this.members[id].admin;
	}
	add_admin(id) {
		if (this.is_member(id)) this.members[id].admin = true;
	}
	del_admin(id) {
		if (this.is_member(id)) this.members[id].admin = false;
	}
	num_admins() {
		return Object.keys(this.members).filter((id) => this.members[id].admin)
			.length;
	}
};

const RoomManager = class {
	constructor() {
		this.rooms = {};
	}

	// room management
	is_room(id) {
		return id in this.rooms;
	}

	// user management
	is_member_in_room(user_id, room_id) {
		return this.is_room(room_id) && this.rooms[room_id].is_member(user_id);
	}
	is_admin_in_room(user_id, room_id) {
		return (
			this.is_room(room_id) &&
			this.rooms[room_id].is_member(user_id) &&
			this.rooms[room_id].is_admin(user_id)
		);
	}

	// remove user from room
	remove_user_from_room(user_id, room_id) {
		if (this.is_member_in_room(user_id, room_id)) {
			this.rooms[room_id].del_member(user_id);
			if (this.rooms[room_id].num_members() === 0) {
				console.log(
					`Room <${room_id}> is now empty and will be deleted.`,
				);
				delete this.rooms[room_id]; // Remove empty room immediately
			} else if (this.rooms[room_id].num_admins() === 0) {
				this.rooms[room_id].add_admin(
					Object.keys(this.rooms[room_id].members)[0],
				);
			}
		}
	}

	// remove user from all rooms
	remove_user_from_all_rooms(user_id) {
		for (const room_id of this.rooms_of_user(user_id)) {
			this.remove_user_from_room(user_id, room_id);
		}
	}

	// add user to room
	add_user_to_room(user_id, user_name, room_id) {
		this.rooms[room_id].add_member(user_id, new Member(user_name));
	}

	// all rooms of a user
	rooms_of_user(user_id) {
		return Object.keys(this.rooms).filter((room_id) =>
			this.is_member_in_room(user_id, room_id),
		);
	}
	rooms_of_admin(user_id) {
		return Object.keys(this.rooms).filter((room_id) =>
			this.is_admin_in_room(user_id, room_id),
		);
	}
};

const room_manager = new RoomManager();
// Track { userID: { socketID, missedPings, disconnectedAt } }
const activeUsers = {};

function broadcastRoomUpdate(room_id) {
	if (!room_manager.is_room(room_id)) {
		return;
	}
	for (const user_id of Object.keys(room_manager.rooms[room_id].members)) {
		if (activeUsers[user_id] === undefined) {
			continue;
		}
		io.to(activeUsers[user_id].socketID).emit(
			"roomUpdate",
			room_manager.rooms[room_id],
		);
	}
}

function removeInactiveUser(userID, reason) {
	const roomIDs = room_manager.rooms_of_user(userID);
	console.log(`User ${userID} removed due to inactivity (${reason}).`);
	room_manager.remove_user_from_all_rooms(userID);
	delete activeUsers[userID];
	roomIDs.forEach(broadcastRoomUpdate);
}

io.on("connection", (socket) => {
	let currentID = null;

	console.log(`A new connection appeared! (socket: ${socket.id}).`);

	socket.emit("ask");

	socket.on("register", function (data) {
		if (data !== null && activeUsers[parseInt(data)] !== undefined) {
			currentID = parseInt(data);
			console.log(
				`ID [${currentID}] reconnected (socket: ${socket.id}).`,
			);
		} else {
			currentID = 1000 + Math.floor(Math.random() * 8999);
			while (activeUsers[currentID] !== undefined) {
				currentID = 1000 + Math.floor(Math.random() * 8999);
			}
			console.log(`ID [${currentID}] registered (socket: ${socket.id}).`);
		}

		activeUsers[currentID] = {
			socketID: socket.id,
			missedPings: 0,
			disconnectedAt: null,
		};
		io.to(socket.id).emit("return", currentID);

		for (const room_id of room_manager.rooms_of_user(currentID)) {
			socket.join(room_id);
			update(room_id);
		}
	});

	socket.on("pong", () => {
		if (currentID && activeUsers[currentID]?.socketID === socket.id) {
			activeUsers[currentID].missedPings = 0;
			activeUsers[currentID].disconnectedAt = null;
		}
	});

	io.to(socket.id).emit("wordlistUpdate", getAvailableWordlists());

	function update(room_id) {
		if (!room_manager.is_room(room_id)) {
			return;
		}
		for (const user_id of Object.keys(
			room_manager.rooms[room_id].members,
		)) {
			if (activeUsers[user_id] === undefined) {
				continue;
			}
			io.to(activeUsers[user_id].socketID).emit(
				"roomUpdate",
				room_manager.rooms[room_id],
			);
		}
	}

	function leave_room() {
		for (const room_id of room_manager.rooms_of_user(currentID)) {
			console.log(`${currentID} left <${room_id}>`);
			room_manager.remove_user_from_room(currentID, room_id);
			socket.leave(room_id);
			update(room_id);
		}
	}

	socket.on("disconnect", () => {
		console.log(
			`A connection disappeared! (socket: ${socket.id}, id: ${currentID}).`,
		);
		if (currentID && activeUsers[currentID]?.socketID === socket.id) {
			activeUsers[currentID].disconnectedAt = Date.now();
		}
	});

	socket.on("joinRoom", (dataObject) => {
		leave_room();
		if (activeUsers[currentID] === undefined) {
			return;
		}

		let user_name = dataObject.user_name.toLowerCase();
		let room_id = dataObject.room_id.toLowerCase();
		if (!room_id || !user_name) return;

		if (!room_manager.is_room(room_id)) {
			console.log(`${currentID} created <${room_id}>`);
			room_manager.rooms[room_id] = new Room(room_id);
			room_manager.add_user_to_room(currentID, user_name, room_id);
			room_manager.rooms[room_id].add_admin(currentID);
		} else {
			console.log(`${currentID} joined <${room_id}>`);
			room_manager.add_user_to_room(currentID, user_name, room_id);
		}

		socket.join(room_id);
		update(room_id);
	});

	socket.on("toggleAdmin", (user_id) => {
		for (const room_id of room_manager.rooms_of_admin(currentID)) {
			room_manager.rooms[room_id].members[user_id].admin =
				!room_manager.rooms[room_id].members[user_id].admin;
			if (room_manager.rooms[room_id].num_admins() == 0) {
				room_manager.rooms[room_id].add_admin(user_id);
			}
			update(room_id);
		}
	});

	socket.on("setTimerEnabled", (enabled) => {
		for (const room_id of room_manager.rooms_of_admin(currentID)) {
			room_manager.rooms[room_id].timerEnabled = Boolean(enabled);
			console.log(
				`<${currentID} @ ${room_id}> set timer to ${room_manager.rooms[room_id].timerEnabled}.`,
			);
			update(room_id);
		}
	});

	socket.on("revealCards", (cards) => {
		for (const room_id of room_manager.rooms_of_admin(currentID)) {
			console.log(`<${currentID} @ ${room_id}> revealed card ${cards}.`);

			for (const card of cards) {
				room_manager.rooms[room_id].game.reveal(card);
			}

			update(room_id);

			if (room_manager.rooms[room_id].game.over) {
				return;
			}

			if (room_manager.rooms[room_id].game.state() == -1) {
				io.to(room_id).emit(
					"gameOver",
					room_manager.rooms[room_id].game.current,
				);
				console.log(
					`<${currentID} @ ${room_id}> game over (${room_manager.rooms[room_id].game.current}).`,
				);
			}
		}
	});

	socket.on("reinitGame", (wordLists, assassin) => {
		for (const room_id of room_manager.rooms_of_admin(currentID)) {
			const selected = getSelectedWordlists(wordLists);
			console.log(
				`<${currentID} @ ${room_id}> reinits game with ${selected.join(", ")}.`,
			);
			room_manager.rooms[room_id].game = new Game(selected, assassin);
			update(room_id);
		}
	});

	socket.on("next", () => {
		for (const room_id of room_manager.rooms_of_admin(currentID)) {
			console.log(`<${currentID} @ ${room_id}> goes next.`);
			room_manager.rooms[room_id].game.next();
			update(room_id);
		}
	});
});

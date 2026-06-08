const socket = io();
let currentID = sessionStorage.getItem("codenames_user_id");

// Holds the most recent room state so settings toggles can re-render without
// waiting for a new server update.
let lastData = null;

// Server-provided timestamp (ms) marking when the current turn started.
let currentTurnStart = null;

// --- Persistent settings (localStorage) ------------------------------------

function loadSettings() {
	const colors = localStorage.getItem("cn_colors") === "true";
	const sorted = localStorage.getItem("cn_sorted") === "true";
	const assassinRaw = localStorage.getItem("cn_assassin");
	const assassin = assassinRaw === null ? true : assassinRaw === "true";

	document.getElementById("colors").checked = colors;
	document.getElementById("sorted").checked = sorted;
	document.getElementById("assassin-toggle").checked = assassin;
}

function saveSettings() {
	localStorage.setItem(
		"cn_colors",
		document.getElementById("colors").checked,
	);
	localStorage.setItem(
		"cn_sorted",
		document.getElementById("sorted").checked,
	);
	localStorage.setItem(
		"cn_assassin",
		document.getElementById("assassin-toggle").checked,
	);
}

function rerender() {
	if (!lastData) return;
	const admin = document.getElementById("colors").checked;
	const sorted = document.getElementById("sorted").checked;
	buildGrid(lastData, admin, sorted);
	document.getElementById("stats-lower").innerHTML = getStats(lastData);
	updateTimer();
	adjustFontSize();
}

function joinRoom() {
	const room = document.getElementById("room_id").value;
	const user = document.getElementById("user_name").value;
	if (
		!confirm(
			"You are about join <" +
				room.toLowerCase() +
				"> as <" +
				user.toLowerCase() +
				">",
		)
	) {
		return;
	}
	localStorage.setItem("cn_room", room);
	localStorage.setItem("cn_user", user);
	socket.emit("joinRoom", { room_id: room, user_name: user });
}

socket.on("ask", () => {
	socket.emit("register", currentID);
	resetRoom();
});

socket.on("return", (data) => {
	currentID = data;
	sessionStorage.setItem("codenames_user_id", currentID);
	loadSettings();
});

function resetRoom() {
	document.getElementById("grid-container").innerHTML = "";
	document.getElementById("stats-lower").innerHTML = "";
	document.body.style.backgroundColor = "#f5f5f5";
	document.getElementById("room_info").innerHTML = "";
	Array.from(document.getElementsByClassName("admin-controls")).forEach(
		(o) => {
			o.classList.add("hidden");
		},
	);
	lastData = null;
	currentTurnStart = null;
	loadSettings();
}

document.addEventListener("DOMContentLoaded", function () {
	// restore the last used room/user, falling back to the defaults
	document.getElementById("room_id").value =
		localStorage.getItem("cn_room") || "theroom";
	document.getElementById("user_name").value =
		localStorage.getItem("cn_user") || "mark";

	loadSettings();

	// Wire settings toggles exactly once. Each change persists the setting and
	// re-renders the current board.
	["colors", "sorted", "assassin-toggle"].forEach((id) => {
		document.getElementById(id).addEventListener("change", () => {
			saveSettings();
			rerender();
		});
	});
});

function buildGrid(data, admin, sorted) {
	let grid = "";

	let word_indices = [];
	if (sorted && sorted !== null) {
		word_indices = [
			1, 2, 21, 10, 11, 3, 4, 22, 12, 13, 5, 6, 0, 14, 15, 7, 8, 23, 16,
			17, 9, 18, 19, 20, 24,
		].map((i) => data.game.coloring[i]);
	} else {
		word_indices = [
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
			19, 20, 21, 22, 23, 24,
		];
	}

	for (let i of word_indices) {
		let str = data.game.codenames[i];
		let index = data.game.coloring.indexOf(i);
		// assassin is coloring[0]
		// red cards is coloring[1..9]
		// blue cards is coloring[10..17]
		// neutral is coloring[18..25]
		let card;
		if (index === 0) {
			if (document.getElementById("assassin-toggle").checked) {
				card = "assassin";
			} else {
				card = "innocent";
			}
		} else if (index >= 1 && index <= 9) {
			card = "red";
		} else if (index >= 10 && index <= 17) {
			card = "blue";
		} else {
			card = "innocent";
		}

		let card_type;
		if (data.game.revealed[i]) {
			card_type = card + "-revealed";
		} else if (admin && admin !== null) {
			card_type = card + "-unrevealed";
		} else {
			card_type = "default";
		}

		grid += `<div class="grid-item ${card_type}" id="${i}"><b>${str}</b></div>`;
	}

	document.getElementById("grid-container").innerHTML = grid;

	// reveal card upon click
	Array.from(document.getElementsByClassName("grid-item")).forEach((c) => {
		c.addEventListener("click", () => {
			if (c.getAttribute("highlighted") != null) {
				Array.from(
					document.getElementsByClassName("grid-item"),
				).forEach((o) => {
					o.removeAttribute("highlighted");
				});
				socket.emit("revealCards", [c.id]);
			} else {
				Array.from(
					document.getElementsByClassName("grid-item"),
				).forEach((o) => {
					o.removeAttribute("highlighted");
				});
				c.setAttribute("highlighted", "");
			}
		});
	});
}

function getStats(data) {
	let assassin = 0;
	let red = 0;
	let blue = 0;
	let neutral = 0;
	let revealed = 0;

	if (!document.getElementById("assassin-toggle").checked) {
		assassin += 1;
		neutral -= 1;
	}

	for (let i = 0; i < data.game.revealed.length; i++) {
		let index = data.game.coloring.indexOf(i);
		if (data.game.revealed[i]) {
			if (index === 0) {
				if (document.getElementById("assassin-toggle").checked) {
					assassin += 1;
				} else {
					neutral += 1;
				}
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
	return `<div style="text-align: center;"><span class="circle red-revealed">${9 - red}</span>&emsp;<span class="circle blue-revealed">${8 - blue}</span>&emsp;<span class="circle innocent-revealed">${7 - neutral}</span>&emsp;<span class="circle assassin-revealed">${1 - assassin}</span>&emsp;&emsp;<span id="timer" style="font-variant-numeric: tabular-nums;"></span></div>`;
}

// --- Turn timer ------------------------------------------------------------

function updateTimer() {
	const el = document.getElementById("timer");
	if (!el) return;
	if (currentTurnStart == null) {
		el.textContent = "";
		return;
	}
	let elapsed = Math.floor((Date.now() - currentTurnStart) / 1000);
	if (elapsed < 0) elapsed = 0;
	const m = Math.floor(elapsed / 60);
	const s = elapsed % 60;
	el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

setInterval(updateTimer, 250);

function adjustFontSize() {
	const gridItems = Array.from(document.querySelectorAll(".grid-item"));
	if (gridItems.length === 0) return;

	// True when the card's text fits without overflowing at the given size.
	const fits = (item, size) => {
		item.style.fontSize = `${size}px`;
		return (
			item.scrollWidth <= item.clientWidth &&
			item.scrollHeight <= item.clientHeight
		);
	};

	// A font can never be taller than the card itself, so use the card height
	// as the upper bound for the search.
	let lo = 4;
	let hi = Math.max(lo, Math.ceil(gridItems[0].clientHeight));
	let best = lo;

	// Binary search for the largest size that fits in EVERY card, so all cards
	// share one uniform, as-large-as-possible font.
	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (gridItems.every((item) => fits(item, mid))) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}

	// Scale down slightly so text never touches the card edges.
	const finalSize = best * 0.9;
	gridItems.forEach((item) => {
		item.style.fontSize = `${finalSize}px`;
	});
}

let toggle_var = false;
function toggle() {
	if (toggle_var) {
		// for all in document.getElementsByClassName('toggleable'), set display to 'none'
		Array.from(document.getElementsByClassName("toggleable")).forEach(
			(o) => {
				o.style.old_display = o.style.display;
				o.style.display = "none";
				Array.from(o.querySelectorAll("*")).forEach((c) => {
					c.style.old_display = c.style.display;
					c.style.display = "none";
				});
			},
		);
		document.getElementById("grid-container").style.height = "94vmin";
		toggle_var = false;
	} else {
		// for all in document.getElementsByClassName('toggleable'), set display to ''
		Array.from(document.getElementsByClassName("toggleable")).forEach(
			(o) => {
				o.style.display = o.style.old_display;
				Array.from(o.querySelectorAll("*")).forEach((c) => {
					c.style.display = c.style.old_display;
				});
			},
		);
		document.getElementById("grid-container").style.height = "70vmin";
		toggle_var = true;
	}
	adjustFontSize();
}

// Call the function when the page loads and when the window resizes
window.onload = adjustFontSize;
window.onresize = adjustFontSize;
window.addEventListener("orientationchange", (event) => {
	adjustFontSize;
});

// Count the pings, if not received in last TIMEOUT seconds, refresh the page
const TIMEOUT = 30;
let pingCount = 0;
setInterval(() => {
	if (pingCount === 0) {
		location.reload();
	}
	pingCount = 0;
}, 1000 * TIMEOUT);

// Respond to server ping
socket.on("ping", () => {
	socket.emit("pong");
	pingCount += 1;
});

socket.on("gameOver", (data) => {
	document.body.style.backgroundColor = "#f5f5f5";

	let length = 10;
	if (data === "red-assassin") {
		startWinAnimation("rgb(0, 0, 0, 1.0)", length);
		startWinAnimation("rgb(209, 86, 86, 1.0)", length);
	} else if (data === "blue-assassin") {
		startWinAnimation("rgb(0, 0, 0, 1.0)", length);
		startWinAnimation("rgb(86, 102, 209, 1.0)", length);
	} else if (data === "red") {
		startWinAnimation("rgb(209, 86, 86, 1.0)", length);
	} else if (data === "blue") {
		startWinAnimation("rgb(86, 102, 209, 1.0)", length);
	}
});

socket.on("wordlistUpdate", (data) => {
	let options = "";
	data.forEach((list) => {
		if (list === "original") {
			options += `<option value="${list}" selected>${list}</option>`;
		} else {
			options += `<option value="${list}">${list}</option>`;
		}
	});
	document.getElementById("wordlist").innerHTML = options;
	adjustFontSize();
});

socket.on("roomUpdate", (data) => {
	lastData = data;

	// show grid
	let sorted = document.getElementById("sorted").checked;
	let admin = document.getElementById("colors").checked;
	buildGrid(data, admin, sorted);
	document.getElementById("stats-lower").innerHTML = getStats(data);

	// The turn timer freezes once the game is over, otherwise it tracks the
	// server-provided turn start so all clients stay in sync.
	if (data.game.over) {
		currentTurnStart = null;
	} else {
		currentTurnStart = data.game.turnStart;
	}
	updateTimer();

	if (data.game.over) {
		document.body.style.backgroundColor = "#f5f5f5";
	} else {
		if (data.game.current == "red") {
			document.body.style.backgroundColor = "#ffe9e9";
		} else if (data.game.current == "blue") {
			document.body.style.backgroundColor = "#e6eaff";
		}
	}

	// show room info
	// make bold for this user
	// make underline for admin
	//
	// A name only shows a number once the room has ever had more than one
	// member with that name. The number is assigned at join time and is
	// persistent, so it stays stable even after others leave.
	let members = [];
	for (const [id, member] of Object.entries(data.members)) {
		let bold = "";
		let underline = "";
		if (id == currentID) {
			bold = "font-weight: bold;";
		}
		if (member.admin) {
			underline = "text-decoration: underline;";
		}
		const duplicated = (data.name_counts[member.name] || 0) > 1;
		const label = duplicated
			? `${member.name} ${member.number}`
			: member.name;
		let m = `<span class="member-item" id="${id}" style="${bold}${underline}">${label}</span>`;
		members.push(m);
	}
	document.getElementById("room_info").innerHTML =
		`${data.id}: ${members.join(", ")}`;

	// make admin upon click
	Array.from(document.getElementsByClassName("member-item")).forEach((m) => {
		m.addEventListener("click", (e) => {
			socket.emit("toggleAdmin", e.target.id);
		});
	});

	// show admin controls
	if (data.members[currentID].admin) {
		Array.from(document.getElementsByClassName("admin-controls")).forEach(
			(o) => {
				o.classList.remove("hidden");
			},
		);
	} else {
		Array.from(document.getElementsByClassName("admin-controls")).forEach(
			(o) => {
				o.classList.add("hidden");
			},
		);
	}

	adjustFontSize();
});

const socket = io();
let currentID = sessionStorage.getItem("codenames_user_id");

// Holds the most recent room state so settings toggles can re-render without
// waiting for a new server update.
let lastData = null;

// Server-provided timestamp (ms) marking when the current turn started.
let currentTurnStart = null;

// Room-shared setting controlled by admins.
let currentTimerEnabled = false;

let titleClickCount = 0;
let titleClickTimeout = null;

// --- Persistent settings (localStorage) ------------------------------------

function loadSettings() {
	const spymasterView = localStorage.getItem("cn_spymaster_view") === "true";
	const assassin = localStorage.getItem("cn_assassin") !== "false";
	const timer = localStorage.getItem("cn_timer") === "true";

	const spymasterViewInput = document.getElementById("spymaster-view");
	const assassinInput = document.getElementById("assassin-toggle");
	const timerInput = document.getElementById("timer-toggle");
	if (!spymasterViewInput || !assassinInput || !timerInput) return;

	spymasterViewInput.checked = spymasterView;
	assassinInput.checked = assassin;
	timerInput.checked = timer;
	currentTimerEnabled = timer;
	updateWordlistMenuMode();
}

function saveSettings() {
	localStorage.setItem(
		"cn_spymaster_view",
		document.getElementById("spymaster-view").checked,
	);

	localStorage.setItem(
		"cn_timer",
		document.getElementById("timer-toggle").checked,
	);
	localStorage.setItem(
		"cn_assassin",
		document.getElementById("assassin-toggle").checked,
	);
}

function loadSelectedWordlists() {
	try {
		const selected = JSON.parse(
			localStorage.getItem("cn_wordlists") || "[]",
		);
		if (Array.isArray(selected) && selected.length > 0) {
			return selected;
		}
	} catch (error) {
		console.warn("Could not load saved wordlists", error);
	}
	return ["original"];
}

function getSelectedWordlists() {
	return Array.from(
		document.querySelectorAll("#wordlists input:checked"),
	).map((input) => input.value);
}

function updateWordlistMenuMode() {
	const menu = document.getElementById("wordlists");
	if (!menu) return;

	Array.from(menu.querySelectorAll("input")).forEach((input) => {
		input.type = "checkbox";
		input.removeAttribute("name");
	});
}

function updateWordlistDropdownLabel() {
	const button = document.getElementById("wordlist-dropdown-button");
	if (!button) return;

	const selected = getSelectedWordlists();
	if (selected.length === 0) {
		button.textContent = "select wordlist";
	} else if (selected.length > 1) {
		button.textContent = `${selected.length} wordlists`;
	} else {
		button.textContent = selected[0];
	}
}

function saveSelectedWordlists() {
	localStorage.setItem(
		"cn_wordlists",
		JSON.stringify(getSelectedWordlists()),
	);
	updateWordlistDropdownLabel();
}

function closeWordlistDropdown() {
	document.getElementById("wordlists")?.classList.add("hidden");
}

function toggleWordlistDropdown() {
	document.getElementById("wordlists").classList.toggle("hidden");
}

function resetGame() {
	let wordlists = getSelectedWordlists();
	if (wordlists.length === 0) {
		alert("Select at least one wordlist before resetting the game.");
		return;
	}
	if (!confirm("Are you sure you want to re-initialize the game?")) {
		return;
	}
	saveSelectedWordlists();
	socket.emit(
		"reinitGame",
		wordlists,
		document.getElementById("assassin-toggle").checked,
	);
}

function rerender() {
	if (!lastData) return;
	const spymasterView = document.getElementById("spymaster-view").checked;
	buildGrid(lastData, spymasterView, spymasterView);
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
	localStorage.removeItem("cn_spymaster_view");
	localStorage.removeItem("cn_assassin");
	localStorage.removeItem("cn_timer");

	localStorage.removeItem("cn_selected_wordlists");
	localStorage.removeItem("cn_wordlists");
	loadSettings();
	socket.emit("joinRoom", { room_id: room, user_name: user });
}
function exitRoom() {
	socket.emit("leaveRoom");
	resetRoom();
}

socket.on("ask", () => {
	socket.emit("register", currentID);
	resetRoom();
});

socket.on("return", (data) => {
	currentID = data;
	sessionStorage.setItem("codenames_user_id", currentID);
	loadSettings();
	socket.emit("getRooms");
});

socket.on("roomsList", (data) => {
	const list = document.getElementById("rooms-list");
	if (!list) return;

	const loginArea = document.getElementById("login-area");
	const onLoginScreen = loginArea && !loginArea.classList.contains("hidden");
	const footer = document.getElementById("server-footer");
	if (!onLoginScreen) {
		if (footer) footer.innerHTML = "";
		return;
	}

	const rooms = data?.rooms || [];
	const serverStarted = data?.serverStarted;
	const totalReveals = data?.totalReveals != null ? data.totalReveals : 0;

	let html = '<div class="rooms-list-title">current rooms</div>';
	if (rooms.length === 0) {
		html += '<div class="rooms-list-empty">no active rooms</div>';
	} else {
		html += rooms
			.map((r) => {
				const score = r.over
					? "&mdash;"
					: `<span class="room-score-red">${9 - r.red}</span> &ndash; <span class="room-score-blue">${8 - r.blue}</span>`;
				return `<button class="room-chip" onclick="joinRoomFromList('${r.id}')"><span class="room-chip-name">${r.id}</span><span class="room-chip-members">${r.members} player${r.members !== 1 ? "s" : ""}</span><span class="room-chip-score">${score}</span></button>`;
			})
			.join("");
	}
	list.innerHTML = html;

	if (footer && serverStarted) {
		const ago = Math.max(0, Date.now() - serverStarted);
		const minutes = Math.floor(ago / 60000);
		const hours = Math.floor(ago / 3600000);
		const days = Math.floor(ago / 86400000);
		let when;
		if (minutes < 60) {
			when = `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
		} else if (hours < 24) {
			when = `${hours} hour${hours !== 1 ? "s" : ""} ago`;
		} else {
			when = `${days} day${days !== 1 ? "s" : ""} ago`;
		}
		footer.innerHTML = `<div class="server-footer">${rooms.length} room${rooms.length !== 1 ? "s" : ""} active &middot; ${totalReveals} card${totalReveals !== 1 ? "s" : ""} flipped since last server restart (${when})</div>`;
	}
});

function joinRoomFromList(room) {
	document.getElementById("room_id").value = room;
	joinRoom();
}

socket.on("nameTaken", (room_id) => {
	const msg = document.getElementById("name-taken-msg");
	if (msg) {
		msg.classList.remove("hidden");
		setTimeout(() => msg.classList.add("hidden"), 3000);
	}
});
function isCurrentUserAdmin() {
	return Boolean(lastData?.members?.[currentID]?.admin);
}

function triggerHiddenWinAnimation() {
	clearTimeout(titleClickTimeout);
	titleClickCount += 1;

	if (titleClickCount >= 5) {
		titleClickCount = 0;
		if (isCurrentUserAdmin()) {
			socket.emit("forceWin");
		}
		return;
	}

	titleClickTimeout = setTimeout(() => {
		titleClickCount = 0;
	}, 1500);
}

function resetRoom() {
	setFullscreenMode(false);
	document.getElementById("fullscreen-control").classList.add("hidden");
	document.getElementById("grid-container").innerHTML = "";
	document.getElementById("stats-lower").innerHTML = "";
	document.body.style.backgroundColor = "#f5f5f5";
	document.getElementById("room_info").innerHTML = "";
	document.getElementById("server-footer").innerHTML = "";
	document.getElementById("bottom-bar").style.display = "";
	socket.emit("getRooms");
	Array.from(document.getElementsByClassName("admin-controls")).forEach(
		(o) => {
			o.classList.add("hidden");
		},
	);
	Array.from(document.getElementsByClassName("rules-readonly")).forEach(
		(o) => {
			o.classList.add("hidden");
		},
	);
	const panel = document.getElementById("settings-panel");
	if (panel) panel.style.display = "none";
	const row = document.getElementById("settings-row");
	if (row) row.style.display = "none";
	const loginArea = document.getElementById("login-area");
	if (loginArea) loginArea.classList.remove("hidden");
	const roomBar = document.getElementById("room-bar");
	if (roomBar) roomBar.classList.add("hidden");
	const grid = document.getElementById("grid-container");
	if (grid) grid.classList.add("hidden");
	const stats = document.getElementById("stats-lower");
	if (stats) stats.style.display = "none";
	lastData = null;
	currentTurnStart = null;
	loadSettings();
}

document.addEventListener("DOMContentLoaded", function () {
	// restore the last used room/user, falling back to the defaults
	const savedRoom = localStorage.getItem("cn_room");
	document.getElementById("room_id").value =
		!savedRoom || savedRoom === "theroom" ? "hangout" : savedRoom;
	document.getElementById("user_name").value =
		localStorage.getItem("cn_user") || "mark";

	loadSettings();

	document
		.getElementById("codenames-title")
		.addEventListener("click", triggerHiddenWinAnimation);
	// Real-time name uniqueness check.
	document.getElementById("user_name").addEventListener("input", () => {
		const name = document.getElementById("user_name").value.toLowerCase();
		const msg = document.getElementById("name-taken-msg");
		if (!msg || !name) {
			if (msg) msg.classList.add("hidden");
			return;
		}
		const taken =
			lastData &&
			Object.values(lastData.members).some((m) => m.name === name);
		if (taken && lastData.members[currentID]?.name !== name) {
			msg.classList.remove("hidden");
		} else {
			msg.classList.add("hidden");
		}
	});

	document.getElementById("spymaster-view").addEventListener("change", () => {
		saveSettings();
		rerender();
	});

	document
		.getElementById("assassin-toggle")
		.addEventListener("change", () => {
			const assassinEnabled =
				document.getElementById("assassin-toggle").checked;
			rerender();
			socket.emit("setAssassinEnabled", assassinEnabled);
		});

	document.getElementById("timer-toggle").addEventListener("change", () => {
		currentTimerEnabled = document.getElementById("timer-toggle").checked;
		saveSettings();
		updateTimer();
		socket.emit("setTimerEnabled", currentTimerEnabled);
	});

	document.addEventListener("click", (event) => {
		const dropdown = document.getElementById("wordlist-dropdown");
		if (dropdown && !dropdown.contains(event.target)) {
			closeWordlistDropdown();
		}
	});

	// Refresh room list periodically (every 5 seconds)
	setInterval(() => socket.emit("getRooms"), 5000);
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
		let str = data.game.codenames[i].toUpperCase();
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
	const nextButton = data.members[currentID]?.admin
		? `<button class="compact-button" onclick="socket.emit('next')">next</button>`
		: "";
	return `<div class="stats-row"><span class="circle red-revealed">${9 - red}</span><span class="circle blue-revealed">${8 - blue}</span><span class="circle innocent-revealed">${7 - neutral}</span><span class="circle assassin-revealed">${1 - assassin}</span><span id="timer" class="turn-timer"></span>${nextButton}</div>`;
}

// --- Turn timer ------------------------------------------------------------

let lastZzzCycle = -1;
let lastShakeState = null; // tracks current shake / dead state to avoid animation restarts

function updateSleepyZzz(el, elapsed) {
	const cycle = Math.floor((elapsed - 10 * 60) / 21.6);
	if (cycle === lastZzzCycle) return;
	lastZzzCycle = cycle;

	const phrases = ["...zzz", "...zzzZZZ", "..zzZZzz"];
	const phrase = phrases[Math.floor(Math.random() * phrases.length)];
	const x = (Math.random() * 0.5).toFixed(2);
	const y = (-0.9 + Math.random() * 0.7).toFixed(2);

	el.dataset.zzz = phrase;
	el.style.setProperty("--zzz-x", `${x}em`);
	el.style.setProperty("--zzz-y", `${y}em`);
}

function clearSleepyZzz(el) {
	delete el.dataset.zzz;
	el.style.removeProperty("--zzz-x");
	el.style.removeProperty("--zzz-y");
	lastZzzCycle = -1;
}

function updateTimerShake(el, elapsed) {
	// Determine the desired state so we only touch the DOM when it changes,
	// preventing CSS animations from restarting on every 250ms tick.
	let desired = null;

	if (elapsed >= 10 * 60) {
		desired = "timer-dead";
	} else if (elapsed >= 8 * 60) {
		desired = "timer-shake-high";
	} else if (elapsed >= 5 * 60) {
		desired = "timer-shake-medium";
	} else if (elapsed >= 2 * 60) {
		desired = "timer-shake-low";
	}

	if (desired === lastShakeState) {
		// Only zzz phrase may need updating while dead; classlist is unchanged.
		if (desired === "timer-dead") updateSleepyZzz(el, elapsed);
		return;
	}

	// Transition to new state — remove old classes and apply the new one.
	el.classList.remove(
		"timer-shake-low",
		"timer-shake-medium",
		"timer-shake-high",
		"timer-dead",
	);

	if (desired) {
		el.classList.add(desired);
	}

	if (desired === "timer-dead") {
		updateSleepyZzz(el, elapsed);
	} else {
		clearSleepyZzz(el);
	}

	lastShakeState = desired;
}

function updateTimer() {
	const el = document.getElementById("timer");
	if (!el) return;
	if (!currentTimerEnabled) {
		el.textContent = "";
		el.classList.add("hidden");
		updateTimerShake(el, 0);
		return;
	}
	el.classList.remove("hidden");
	if (currentTurnStart == null) {
		el.textContent = "";
		updateTimerShake(el, 0);
		return;
	}
	let elapsed = Math.floor((Date.now() - currentTurnStart) / 1000);
	if (elapsed < 0) elapsed = 0;
	const m = Math.floor(elapsed / 60);
	const s = elapsed % 60;
	el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
	updateTimerShake(el, elapsed);
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

function setFullscreenGridHeight() {
	const grid = document.getElementById("grid-container");
	const stats = document.getElementById("stats-lower");
	const gridTop = grid.getBoundingClientRect().top;
	const statsHeight = stats.getBoundingClientRect().height;
	const bottomBuffer = 8;
	const availableHeight =
		window.innerHeight - gridTop - statsHeight - bottomBuffer;
	grid.style.height = `${Math.max(0, availableHeight)}px`;
}

function setFullscreenMode(active) {
	document.documentElement.classList.toggle("fullscreen-mode", active);
	document.body.classList.toggle("fullscreen-mode", active);
}

let toggle_var = true;
function toggle() {
	if (toggle_var) {
		// Hide controls, but keep the Codenames title visible in fullscreen.
		Array.from(document.getElementsByClassName("toggleable")).forEach(
			(o) => {
				if (o.classList.contains("app-title")) return;
				o.style.old_display = o.style.display;
				o.style.display = "none";
				Array.from(o.querySelectorAll("*")).forEach((c) => {
					c.style.old_display = c.style.display;
					c.style.display = "none";
				});
			},
		);
		document.querySelector(".info-trigger")?.classList.add("hidden");
		const roomBar = document.getElementById("room-bar");
		if (roomBar) roomBar.classList.add("hidden");
		const settingsPanel = document.getElementById("settings-panel");
		if (settingsPanel) settingsPanel.style.display = "none";
		closeTooltip();
		document.getElementById("server-footer").style.display = "none";
		setFullscreenMode(true);
		setFullscreenGridHeight();
		toggle_var = false;
	} else {
		// for all in document.getElementsByClassName('toggleable'), set display to ''
		Array.from(document.getElementsByClassName("toggleable")).forEach(
			(o) => {
				o.style.display = o.style.old_display;
				Array.from(o.querySelectorAll("*")).forEach((c) => {
					c.style.display = c.style.old_display;
					const roomBar = document.getElementById("room-bar");
					if (roomBar && lastData) roomBar.classList.remove("hidden");
					const panel = document.getElementById("settings-panel");
					if (panel && lastData?.members?.[currentID]?.admin)
						panel.style.display = "";
					const row = document.getElementById("settings-row");
					if (row) row.style.display = "";
				});
			},
		);
		document.querySelector(".info-trigger")?.classList.remove("hidden");
		document.getElementById("grid-container").style.height = "70vmin";
		document.getElementById("server-footer").style.display = "";
		setFullscreenMode(false);
		toggle_var = true;
	}
	adjustFontSize();
}

// Call the function when the page loads and when the window resizes
window.addEventListener("load", adjustFontSize);
window.onresize = () => {
	if (!toggle_var) {
		setFullscreenGridHeight();
	}
	adjustFontSize();
};
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

function playWinAnimation(data) {
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
	} else {
		startWinAnimation("rgb(140, 140, 140, 1.0)", length);
	}
}

socket.on("gameOver", (data) => {
	document.body.style.backgroundColor = "#f5f5f5";
	playWinAnimation(data);
});

socket.on("forceWin", (data) => {
	playWinAnimation(data);
});

socket.on("wordlistUpdate", (data) => {
	const wordlists = document.getElementById("wordlists");
	wordlists.innerHTML = "";

	const saved = loadSelectedWordlists();
	const selected = saved.filter((list) => data.includes(list));
	if (selected.length === 0 && data.includes("original")) {
		selected.push("original");
	}

	const groups = [
		{
			title: "official",
			lists: ["original", "duet", "undercover", "german"],
		},
		{
			title: "custom",
			lists: [
				"dutch",
				"german2",
				"halloween",
				"geometry",
				"na’vi",
				"genz",
				"theroom",
			],
		},
		{
			title: "chaos",
			lists: ["countries", "europe", "colors", "emoji"],
		},
	];

	const listed = new Set(groups.flatMap((group) => group.lists));
	const remaining = data.filter((list) => !listed.has(list));
	if (remaining.length > 0) {
		groups.push({ title: "other", lists: remaining });
	}

	const addWordlistOption = (list) => {
		const label = document.createElement("label");
		label.className = "wordlist-option toggle-label";

		const input = document.createElement("input");
		input.type = "checkbox";
		input.value = list;
		input.checked = selected.includes(list);
		input.addEventListener("change", () => {
			saveSelectedWordlists();
		});

		const text = document.createElement("span");
		text.className = "toggle-text";
		text.textContent = list;

		label.append(input, text);
		wordlists.appendChild(label);
	};

	groups.forEach((group) => {
		const availableLists = group.lists.filter((list) =>
			data.includes(list),
		);
		if (availableLists.length === 0) return;

		const title = document.createElement("div");
		title.className = "wordlist-group-title";
		title.textContent = group.title;
		wordlists.appendChild(title);

		availableLists.forEach(addWordlistOption);
	});

	updateWordlistMenuMode();
	saveSelectedWordlists();
	adjustFontSize();
});

socket.on("roomUpdate", (data) => {
	lastData = data;

	const loginArea = document.getElementById("login-area");
	if (loginArea) loginArea.classList.add("hidden");
	const bottomBar = document.getElementById("bottom-bar");
	if (bottomBar) bottomBar.style.display = "";
	document.getElementById("server-footer").innerHTML = "";
	const roomBar = document.getElementById("room-bar");
	if (roomBar) roomBar.classList.remove("hidden");
	const grid = document.getElementById("grid-container");
	if (grid) grid.classList.remove("hidden");
	const stats = document.getElementById("stats-lower");
	if (stats) stats.style.display = "";
	const panel = document.getElementById("settings-panel");
	const isSpymaster = data.members[currentID]?.admin;
	if (isSpymaster) {
		if (panel) panel.style.display = "";
		const row = document.getElementById("settings-row");
		if (row) row.style.display = "";
	} else {
		if (panel) panel.style.display = "none";
		const row = document.getElementById("settings-row");
		if (row) row.style.display = "none";
	}

	document.getElementById("fullscreen-control").classList.remove("hidden");
	currentTimerEnabled = data.timerEnabled !== false;
	const assassinEnabled = data.assassinEnabled !== false;
	document.getElementById("timer-toggle").checked = currentTimerEnabled;
	document.getElementById("timer-readonly").checked = currentTimerEnabled;
	document.getElementById("assassin-toggle").checked = assassinEnabled;
	document.getElementById("assassin-readonly").checked = assassinEnabled;

	// show grid
	let spymasterView = document.getElementById("spymaster-view").checked;
	buildGrid(data, spymasterView, spymasterView);
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
	const isAdmin = data.members[currentID]?.admin;
	const memberEntries = Object.entries(data.members);
	memberEntries.sort(([, a], [, b]) => {
		if (a.admin && !b.admin) return -1;
		if (!a.admin && b.admin) return 1;
		return 0;
	});
	let memberSpans = [];
	for (const [id, member] of memberEntries) {
		const isYou = id == currentID;
		const star = member.admin ? '<span class="member-star">★</span>' : "";
		const you = isYou ? '<span class="member-you">(you)</span>' : "";
		const nameClass =
			"member-name" + (isAdmin ? " member-name--clickable" : "");
		memberSpans.push(
			`<span class="member-item" data-member-id="${id}">${star}<span class="${nameClass}">${member.name}</span>${you}</span>`,
		);
	}
	document.getElementById("room_info").innerHTML =
		`<span class="room-id-label">${data.id}</span><div class="member-list">${memberSpans.join("")}</div>`;

	// Admins click a name to toggle spymaster status.
	Array.from(
		document.getElementsByClassName("member-name--clickable"),
	).forEach((n) => {
		n.addEventListener("click", (e) => {
			const targetId = e.target.closest(".member-item").dataset.memberId;
			if (targetId == currentID && data.members[currentID]?.admin) {
				const totalSpymasters = Object.values(data.members).filter(
					(m) => m.admin,
				).length;
				const msg =
					totalSpymasters === 1
						? "You are the last spymaster. Removing the role will promote a random player instead. Continue?"
						: "Remove spymaster role from yourself?";
				if (!confirm(msg)) {
					return;
				}
			}
			socket.emit("toggleAdmin", targetId);
		});
	});

	// show admin controls, or read-only shared rules for non-admins
	if (data.members[currentID].admin) {
		Array.from(document.getElementsByClassName("admin-controls")).forEach(
			(o) => {
				o.classList.remove("hidden");
			},
		);
		Array.from(document.getElementsByClassName("rules-readonly")).forEach(
			(o) => {
				o.classList.add("hidden");
			},
		);
	} else {
		Array.from(document.getElementsByClassName("admin-controls")).forEach(
			(o) => {
				o.classList.add("hidden");
			},
		);
		Array.from(document.getElementsByClassName("rules-readonly")).forEach(
			(o) => {
				o.classList.remove("hidden");
			},
		);
	}

	adjustFontSize();
});

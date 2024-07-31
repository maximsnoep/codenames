const socket = io();

// choose random character from the cast of The Room (2003)
document.addEventListener('DOMContentLoaded', function() {
    const characters = ["Johnny", "Lisa", "Mark", "Denny", "Michelle", "Chris-R", "Steven", "Claudette", "Mike", "Peter", "Florist", "Doggy"];
    let randomCharacter = characters[Math.floor(Math.random() * characters.length)];
    // set default room and user
    document.getElementById('room_id').value = "rooftop";
    document.getElementById('user_name').value = randomCharacter;
});

function buildGrid(data, admin, sorted) {
    let grid = '';

    let word_indices = [];
    if (sorted && sorted !== null) {
        word_indices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 19, 20, 0, 21, 22, 23, 24, 10, 11, 12, 13, 14, 15, 16, 17].map(i => data.game.coloring[i]);
    } else {
        word_indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
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
            card = "assassin";
        } else if (index >= 1 && index <= 9) {
            card = "red";
        } else if (index >= 10 && index <= 17) {
            card = "blue";
        } else {
            card = "innocent";
        }

        if (data.game.revealed[i]) {
            card_type = card+"-revealed";
        } else if (admin && admin !== null) {
            card_type = card+"-unrevealed";
        } else {
            card_type = "default"
        }

        grid += `<div class="grid-item ${card_type}" id="${i}" onclick="{ socket.emit('revealCards', [${i}]); }"><b>${str}</b></div>`
    }
    return grid;
}

function getStats(data) {
    let assassin = 0;
    let red = 0;
    let blue = 0;
    let neutral = 0;
    let revealed = 0;
    
    for (let i = 0; i < data.game.revealed.length; i++) {
        let index = data.game.coloring.indexOf(i);
        if (data.game.revealed[i]) {
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
    return [`<div style="text-align: center;">${revealed} / 25</div>`, `<div style="text-align: center;">red: ${red} / 9&emsp;blue: ${blue} / 8&emsp;neutral ${neutral} / 7&emsp;assassin: ${assassin} / 1</div>`];
}

function adjustFontSize() {
    const gridItems = document.querySelectorAll('.grid-item');
    let minFontSize = 40;

    gridItems.forEach(item => {
        let fontSize = minFontSize;
        item.style.fontSize = `${fontSize}px`;

        while (item.scrollHeight > item.offsetHeight || item.scrollWidth > item.offsetWidth) {
            fontSize -= 2;
            item.style.fontSize = `${fontSize}px`;
        }

        minFontSize = Math.min(minFontSize, fontSize);
    });

    gridItems.forEach(item => {
        item.style.fontSize = `${minFontSize-4}px`;
    });

    
}

// Call the function when the page loads and when the window resizes
window.onload = adjustFontSize;
window.onresize = adjustFontSize;

socket.on('gameOver', (data) => {
    let length = 5;
    if (data === "assassin") {
        startWinAnimation('rgb(0, 0, 0, 1.0)', length);
    } else if (data === "red") {
        startWinAnimation('rgb(209, 86, 86, 1.0)', length);
    }
    else if (data === "blue") {
        startWinAnimation('rgb(86, 102, 209, 1.0)', length);
    }
});

socket.on('wordlistUpdate', (data) => {
    let options = ''
    data.forEach(list => {
        options += `<option value="${list}">${list}</option>`
    });
    document.getElementById('wordlist').innerHTML = options;
});

socket.on('roomUpdate', (data) => {

    // show grid
    let sorted = document.getElementById('sorted').checked;
    let admin = document.getElementById('colors').checked;
    document.getElementById('grid-container').innerHTML = buildGrid(data, admin, sorted);
    let stats = getStats(data);
    document.getElementById('stats-upper').innerHTML = stats[0];
    document.getElementById('stats-lower').innerHTML = stats[1];

    // show room info
    // make bold for this user
    let admins = [];
    let members = [];
    for (const [id, member] of Object.entries(data.members)) {
        let m = `<span class="member-item" id="${id}" style="font-weight: ${id === socket.id ? "bold" : "normal"}" >${member.name}</span>`;
        if (member.admin) {
            admins.push(m);
        } else {
            members.push(m);
        }
    }
    document.getElementById('room_info').innerHTML = `<b><u>${data.id}</u></b><br/>admins: ${admins.join(', ')}<br/>others: ${members.join(', ')}</span>`;

    // reveal card upon click
    Array.from(document.getElementsByClassName("grid-item")).forEach((c) => {
        c.addEventListener('click', () => { socket.emit('revealCards', [c.id]); });
    });

    // make admin upon click
    Array.from(document.getElementsByClassName("member-item")).forEach((m) => {
        m.addEventListener('click', (e) => { socket.emit('toggleAdmin', e.target.id); });
    });

    // show admin controls
    if (data.members[socket.id].admin) {
        document.getElementById('admin-controls').classList.remove('hidden');
    } else {
        document.getElementById('admin-controls').classList.add('hidden');
    }

    document.getElementById('toggles').addEventListener('change', function() {
        let sorted = document.getElementById('sorted').checked;
        let admin = document.getElementById('colors').checked;
        document.getElementById('grid-container').innerHTML = buildGrid(data, admin, sorted);
        adjustFontSize();
    });

    adjustFontSize();

});
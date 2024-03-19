const socket = io();
let cached_data;
const codeMasterOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 19, 20, 0, 21, 22, 23, 24, 10, 11, 12, 13, 14, 15, 16, 17];
const defaultOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
let wordOrder = defaultOrder;

// choose random character from the cast of The Room (2003)
document.addEventListener('DOMContentLoaded', function() {
    const characters = ["Johnny", "Lisa", "Mark", "Denny", "Michelle", "Chris-R", "Steven", "Claudette", "Mike", "Peter", "Florist", "Doggy"];
    let randomCharacter = characters[Math.floor(Math.random() * characters.length)];
    // set default room and user
    document.getElementById('room_id').value = "theRoom";
    document.getElementById('user_name').value = randomCharacter;
});

function buildGrid(data, admin) {
    let grid = '';
    for (let i of wordOrder) {
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
        } else if (admin) {
            card_type = card+"-unrevealed";
        } else {
            card_type = "default"
        }
        
        grid += `<div class="grid-item ${card_type}" id="${i}" onclick="{ socket.emit('revealCards', [${i}]); }"><b>${str}</b></div>`
    }
    return grid;
}

socket.on('wordlistUpdate', (data) => {
    let dropDown = '';
    data.forEach(list => {
        dropDown += `<button class='dropdown-content' style='position: absolute' onclick='socket.emit('reinitGame', ${list});'>${list}</button></br>`
    });
    document.getElementById('reinitDropdown').innerHTML = dropDown;
});

socket.on('roomUpdate', (data) => {

    console.log(data);

    // show grid
    document.getElementById('grid-container').innerHTML = buildGrid(data, false);
    document.getElementById('grid-container').classList.remove('admin');

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
    document.getElementById('room_info').innerHTML = `<b>${data.id}</b><br/>admins: ${admins.join(', ')}<br/>others: ${members.join(', ')}</span>`;

    // reveal card upon click
    Array.from(document.getElementsByClassName("grid-item")).forEach((c) => {
        c.addEventListener('click', (e) => { socket.emit('revealCards', [c.id]); });
    });

    // make admin upon click
    Array.from(document.getElementsByClassName("member-item")).forEach((m) => {
        m.addEventListener('click', (e) => { socket.emit('toggleAdmin', e.target.id); });
    });

    // show admin controls
    if (data.members[socket.id].admin) {
        document.getElementById('admin_controls').classList.remove('hidden');
    } else {
        document.getElementById('admin_controls').classList.add('hidden');
    }

    cached_data = data;

});

function joinRoom() {
    socket.emit('joinRoom', { 'room_id': document.getElementById('room_id').value, 'user_name': document.getElementById('user_name').value });
}

function toggleColors() {
    document.getElementById('grid-container').classList.toggle('admin');
    if (document.getElementById('grid-container').classList.contains('admin')) {
        document.getElementById('grid-container').innerHTML = buildGrid(cached_data, true);
    } else {
        document.getElementById('grid-container').innerHTML = buildGrid(cached_data, false);
    }
}    

function sortWords() {
    let button = document.getElementById('word-order');
    if (button.textContent === 'codemaster order') {
        wordOrder = [];
        for (let i of codeMasterOrder) {
            wordOrder.push(cached_data.game.coloring[i]);
        }
        button.innerHTML = 'player order';
    } else {
        wordOrder = defaultOrder;
        button.innerHTML = 'codemaster order';
    }
    if (document.getElementById('grid-container').classList.contains('admin')) {
        document.getElementById('grid-container').innerHTML = buildGrid(cached_data, true);
    } else {
        document.getElementById('grid-container').innerHTML = buildGrid(cached_data, false);
    }
}
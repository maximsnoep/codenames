const socket = io();
var cached_data;

// choose random character from the cast of The Room (2003)
document.addEventListener('DOMContentLoaded', function() {
    const characters = ["Johnny", "Lisa", "Mark", "Denny", "Michelle", "Chris-R", "Steven", "Claudette", "Mike", "Peter", "Florist", "Doggy"];
    var randomCharacter = characters[Math.floor(Math.random() * characters.length)];
    // set default room and user
    document.getElementById('room_id').value = "theRoom";
    document.getElementById('user_name').value = randomCharacter;
});

function buildGrid(data, admin) {
    let grid = '';
    data.codenames.forEach((str, i) => {
        let index = data.coloring.indexOf(i);
        // assassin is coloring[0]
        // red cards is coloring[1..9]
        // blue cards is coloring[10..17]
        // neutral is coloring[18..25]
        let card_type = "unrevealed";
        if (admin || data.revealed[i]) {
            if (index === 0) {
                card_type = "assassin";
            } else if (index >= 1 && index <= 9) {
                card_type = "red-revealed";
            } else if (index >= 10 && index <= 17) {
                card_type = "blue-revealed";
            } else {
                card_type = "innocent-revealed";
            }
        }
        grid += `<div class="grid-item ${card_type}" id="${i}"><b>${str}</b></div>`
    });
    return grid;
}

socket.on('roomUpdate', (msg) => {

    console.log(msg);

    let data = msg.data;
    let user = msg.user;

    // show grid
    document.getElementById('grid-container').innerHTML = buildGrid(data, false);
    document.getElementById('grid-container').classList.remove('admin');

    // show room info
    // make bold for this user
    let admins = data.admins.map(a => `<span class="member-item" id="${a}">${a === user ? '<b>' + a + '</b>' : a}</span>`);
    let members = data.members.filter(m => !data.admins.includes(m)).map(m => `<span class="member-item" id="${m}">${m === user ? '<b>' + m + '</b>' : m}</span>`);
    document.getElementById('room_info').innerHTML = `<b>${data.id}</b><br/>admins: ${admins.join(', ')}<br/>others: ${members.join(', ')}</span>`;

    // reveal card upon click
    Array.from(document.getElementsByClassName("grid-item")).forEach((c) => {
        c.addEventListener('click', (e) => { socket.emit('revealCards', [c.id]); });
    });

    // make admin upon click
    Array.from(document.getElementsByClassName("member-item")).forEach((m) => {
        m.addEventListener('click', (e) => { socket.emit('makeAdmin', e.target.id); });
    });

    // show admin controls      
    console.log(data.admins);
    console.log(user);
    console.log(socket.id);
    if (data.admins.includes(user)) {
        document.getElementById('admin_controls').innerHTML = `
          <button onclick="toggleColors()">toggle colors</button>
          <button onclick="socket.emit('reinitGame')">reinit game</button>
          <button onclick="socket.emit('revealCards', [...Array(25).keys()])">reveal all</button>
        `;
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

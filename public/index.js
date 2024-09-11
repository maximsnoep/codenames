const socket = io();

// choose random character from the cast of The Room (2003)
document.addEventListener('DOMContentLoaded', function() {
    const characters = ["mark"];
    let randomCharacter = characters[Math.floor(Math.random() * characters.length)];
    // set default room and user
    document.getElementById('room_id').value = "room";
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

        grid += `<div class="grid-item ${card_type}" id="${i}"><b>${str}</b></div>`
    }

    document.getElementById('grid-container').innerHTML = grid;

    // reveal card upon click
    Array.from(document.getElementsByClassName("grid-item")).forEach((c) => {
        c.addEventListener('click', () => { 
            if (c.getAttribute("highlighted") != null) {
                Array.from(document.getElementsByClassName("grid-item")).forEach((o) => { o.removeAttribute("highlighted"); });
                socket.emit('revealCards', [c.id]);
            } else {
                Array.from(document.getElementsByClassName("grid-item")).forEach((o) => { o.removeAttribute("highlighted"); });
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
    return `<div style="text-align: center;"><span class="circle red-revealed">${9-red}</span>&emsp;<span class="circle blue-revealed">${8-blue}</span>&emsp;<span class="circle innocent-revealed">${7-neutral}</span>&emsp;<span class="circle assassin-revealed">${1-assassin}</span></div>`;
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
        item.style.fontSize = `${minFontSize-2}px`;
    });

    
}

let toggle_var = false;
function toggle() {
    if (toggle_var) {
        // for all in document.getElementsByClassName('toggleable'), set display to 'none'
        Array.from(document.getElementsByClassName('toggleable')).forEach((o) => { o.style.display = 'none'; Array.from(o.querySelectorAll("*")).forEach((c) => { c.style.display = 'none' }); });
        document.getElementById('grid-wrapper').style.height = '85vh';
        toggle_var = false;
    }
    else {
        // for all in document.getElementsByClassName('toggleable'), set display to ''
        Array.from(document.getElementsByClassName('toggleable')).forEach((o) => { o.style.display = ''; Array.from(o.querySelectorAll("*")).forEach((c) => { c.style.display = '' }); });
        document.getElementById('grid-wrapper').style.height = '60vh';
        toggle_var = true;
    }
    adjustFontSize();
}


// Call the function when the page loads and when the window resizes
window.onload = adjustFontSize;
window.onresize = adjustFontSize;

socket.on('gameOver', (data) => {
    let length = 5;
    if (data === "red-assassin") {
        startWinAnimation('rgb(0, 0, 0, 1.0)', length);
        startWinAnimation('rgb(209, 86, 86, 1.0)', length);
    } else if (data === "blue-assassin") {
        startWinAnimation('rgb(0, 0, 0, 1.0)', length);
        startWinAnimation('rgb(86, 102, 209, 1.0)', length);
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
        if (list === "original") {
            options += `<option value="${list}" selected>${list}</option>`
        } else {
            options += `<option value="${list}">${list}</option>`
        }
    });
    document.getElementById('wordlist').innerHTML = options;
});

socket.on('roomUpdate', (data) => {

    // show grid
    let sorted = document.getElementById('sorted').checked;
    let admin = document.getElementById('colors').checked;
    buildGrid(data, admin, sorted);
    document.getElementById('stats-lower').innerHTML = getStats(data);

    if (data.game.current == "red") {
        document.body.style.backgroundColor = "#ffe9e9";
    } else if (data.game.current == "blue") {
        document.body.style.backgroundColor = "#e6eaff";
    } else {
        document.body.style.backgroundColor = "#f5f5f5";
    }

    // show room info
    // make bold for this user
    // make underline for admin
    let members = [];
    for (const [id, member] of Object.entries(data.members)) {
        let bold = "";
        let underline = "";
        if (id == socket.id) {
            bold = "font-weight: bold;";
        }
        if (member.admin) {
            underline = "text-decoration: underline;";  
        }
        let m = `<span class="member-item" id="${id}" style="${bold}${underline}">${member.name}</span>`;
        members.push(m);
    }
    document.getElementById('room_info').innerHTML = `${data.id}: ${members.join(', ')}`;

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
        buildGrid(data, admin, sorted);
        adjustFontSize();
    });

    adjustFontSize();

});
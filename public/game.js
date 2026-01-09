const socket = io(); 
const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');

canvas.width = 1024;
canvas.height = 576;

const gravity = 0.7;
const platformHeight = 100; 
const groundLevel = canvas.height - platformHeight;

let myRole = 'spectator';
let gameRunning = false; 
let animationId;

// HTML Elementleri
const loginScreen = document.getElementById('loginScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameContainer = document.getElementById('gameContainer');
const usernameInput = document.getElementById('usernameInput');
const readyBtn = document.getElementById('readyBtn');
const playerListDiv = document.getElementById('playerList');
const statusText = document.getElementById('statusText');

// ==========================================
// --- MENU VE LOBİ İŞLEMLERİ ---
// ==========================================

function joinGame() {
    const name = usernameInput.value;
    if (name.trim() !== "") {
        socket.emit('joinGame', name);
        loginScreen.style.display = 'none';
        lobbyScreen.style.display = 'flex';
    } else {
        alert("Lütfen bir isim girin!");
    }
}

function toggleReady() {
    socket.emit('playerReady');
    readyBtn.style.background = readyBtn.style.background === 'rgb(204, 204, 0)' ? '#28a745' : '#cccc00';
}

socket.on('joined', (data) => {
    myRole = data.role;
    if (myRole === 'spectator') {
        readyBtn.innerText = "İZLENİYOR";
        readyBtn.disabled = true;
        statusText.innerText = "Maçın başlaması bekleniyor...";
    } else {
        readyBtn.innerText = "HAZIR OL";
        readyBtn.disabled = false;
    }
});

socket.on('updateLobby', (players) => {
    playerListDiv.innerHTML = ''; 
    let p1 = null; let p2 = null; let spectators = 0;

    Object.values(players).forEach(p => {
        if (p.role === 'player1') p1 = p;
        else if (p.role === 'player2') p2 = p;
        else spectators++;
    });

    const createSlot = (p, label) => `
        <div class="slot">
            <span>${p ? p.name : label}</span>
            <span class="${p && p.isReady ? 'ready-yes' : 'ready-no'}">
                ${p ? (p.isReady ? 'HAZIR' : 'BEKLİYOR') : ''}
            </span>
        </div>`;

    playerListDiv.innerHTML += createSlot(p1, 'Oyuncu 1 Bekleniyor...');
    playerListDiv.innerHTML += createSlot(p2, 'Oyuncu 2 Bekleniyor...');
    document.getElementById('spectatorArea').innerText = `İzleyiciler: ${spectators}`;
});

socket.on('gameStart', (players) => {
    lobbyScreen.style.display = 'none';
    gameContainer.style.display = 'block';
    
    const p1 = Object.values(players).find(p => p.role === 'player1');
    const p2 = Object.values(players).find(p => p.role === 'player2');
    
    if(p1 && document.getElementById('p1Name')) document.getElementById('p1Name').innerText = p1.name;
    if(p2 && document.getElementById('p2Name')) document.getElementById('p2Name').innerText = p2.name;

    // RESET
    player.health = 100; enemy.health = 100;
    player.dead = false; enemy.dead = false;
    player.isStunned = false; enemy.isStunned = false;
    player.isBlocking = false; enemy.isBlocking = false;
    player.isAttacking = false; enemy.isAttacking = false;
    player.velocity.x = 0; enemy.velocity.x = 0;
    
    player.position.x = 100; player.position.y = 0;
    enemy.position.x = 800; enemy.position.y = 100;
    
    player.switchSprite('idle', true);
    enemy.switchSprite('idle', true);
    updateHealthBars();

    if (!gameRunning) {
        gameRunning = true;
        animate();
    }
});

socket.on('gameReset', () => {
    alert("Bir oyuncu ayrıldı! Lobiye dönülüyor.");
    gameRunning = false;
    cancelAnimationFrame(animationId);
    gameContainer.style.display = 'none';
    lobbyScreen.style.display = 'flex';
    readyBtn.innerText = "HAZIR OL";
    readyBtn.style.background = '#28a745';
});

// ==========================================
// --- SINIFLAR ---
// ==========================================
class Sprite {
    constructor({ position, imgSrc, scale = 1, framesMax = 1, offset = {x:0, y:0} }) {
        this.position = position;
        this.image = new Image();
        this.image.src = imgSrc;
        this.image.onload = () => { this.loaded = true; }
        this.image.onerror = () => { this.loaded = false; }
        this.scale = scale;
        this.framesMax = framesMax;
        this.framesCurrent = 0;
        this.framesElapsed = 0;
        this.framesHold = 3; 
        this.offset = offset;
        this.facingRight = true; 
        this.loaded = false;
    }

    draw(isEnemy = false) {
        if (!this.loaded) {
            if (this.framesMax > 1) { 
                c.fillStyle = isEnemy ? 'blue' : 'red';
                c.fillRect(this.position.x, this.position.y, 50, 150);
            } else { 
                c.fillStyle = '#2e7d32'; 
                c.fillRect(0, 0, canvas.width, canvas.height);
            }
            return;
        }

        c.save(); 
        
        if (!this.facingRight) {
            const w = this.width || 50; 
            const px = this.position.x + (w / 2);
            c.translate(px, 0); c.scale(-1, 1); c.translate(-px, 0); 
        }

        c.drawImage(
            this.image,
            this.framesCurrent * (this.image.width / this.framesMax),
            0,
            this.image.width / this.framesMax,
            this.image.height,
            this.position.x - this.offset.x,
            this.position.y - this.offset.y,
            (this.image.width / this.framesMax) * this.scale,
            this.image.height * this.scale
        );
        c.restore();
    }

    animateFrames() {
        this.framesElapsed++;
        if (this.framesElapsed % this.framesHold === 0) {
            if (this.framesCurrent < this.framesMax - 1) {
                this.framesCurrent++;
            } else {
                this.framesCurrent = 0;
            }
        }
    }

    update(isEnemy = false) {
        this.draw(isEnemy);
        this.animateFrames();
    }
}

class Fighter extends Sprite {
    constructor({ position, velocity, color = 'red', imgSrc, framesMax = 1, offset = {x:0, y:0}, sprites, scale = 1 }) {
        super({ position, imgSrc, scale, framesMax, offset });
        this.defaultScale = scale; 
        this.velocity = velocity;
        this.width = 50; this.height = 150; this.lastKey;
        
        this.attackBox = { position: { x: this.position.x, y: this.position.y }, offset: { x: 20, y: 72 }, width: 105, height: 80 };
        
        this.isAttacking = false;
        this.health = 100;
        this.sprites = sprites;
        this.dead = false;
        
        this.isBlocking = false;
        this.canParry = false; 
        this.parryWindow = 400; 
        this.isStunned = false; 
        this.isBlockHitting = false; 
        
        this.currentSpriteName = 'idle';

        for (const sprite in this.sprites) {
            sprites[sprite].image = new Image();
            sprites[sprite].image.src = sprites[sprite].imageSrc;
        }
    }

    update(isEnemy = false) {
        this.draw(isEnemy);
        
        // --- 1. BLOK MANTIĞI (ÖNCELİKLİ) ---
        // Eğer karakter blokluyorsa, animasyonu zorla BLOCK yap ve başka hiçbir şeye bakma.
        if (this.isBlocking && !this.isBlockHitting && !this.dead) {
            this.switchSprite('block');
            
            // Eğer blok resmi yoksa yedek çizim
            if (!this.sprites.block.image.complete || this.sprites.block.image.naturalWidth === 0) {
                c.fillStyle = this.canParry ? 'rgba(255, 255, 0, 0.5)' : 'rgba(0, 0, 255, 0.3)';
                c.fillRect(this.position.x, this.position.y, 50, 150);
            }
        } 
        
        // --- 2. DİĞER ANİMASYONLAR ---
        // Sadece bloklamıyorsa çalışır
        else if (!this.dead && this.image !== this.sprites.death.image) {
            this.animateFrames();
            
            if (this.image === this.sprites.attack1.image && this.framesCurrent === this.sprites.attack1.framesMax - 1) {
                this.isAttacking = false;
            }

            if (this.image === this.sprites.hurt.image && this.framesCurrent === this.sprites.hurt.framesMax - 1) {
                this.isStunned = false;
                this.switchSprite('idle', true); 
            }

        } else if (this.image === this.sprites.death.image) {
            if (this.framesCurrent < this.sprites.death.framesMax - 1) {
                this.framesElapsed++;
                if (this.framesElapsed % this.framesHold === 0) this.framesCurrent++;
            } else this.dead = true;
        }

        // Fizik
        this.attackBox.position.x = this.facingRight ? this.position.x + this.attackBox.offset.x : this.position.x - this.attackBox.offset.x - this.attackBox.width + this.width;
        this.attackBox.position.y = this.position.y + this.attackBox.offset.y;
        
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        if (this.position.y + this.height + this.velocity.y >= groundLevel) { 
            this.velocity.y = 0; 
            this.position.y = groundLevel - this.height; 
            
            if (this.isBlocking || this.isStunned) {
                this.velocity.x = 0;
            }
        } else {
            this.velocity.y += gravity;
        }
    }

    attack() {
        if(this.isAttacking || this.dead || this.isBlocking || this.isStunned) return; 
        
        this.switchSprite('attack1');
        this.isAttacking = true;
        
        if ((myRole === 'player1' && this === player) || (myRole === 'player2' && this === enemy)) {
            socket.emit('attack');
        }
    }

    takeHit(attacker) {
        if (this.isBlocking && this.canParry) { if(attacker) attacker.getStunned(); return; }
        
        if (this.isBlocking) {
            this.health -= 2; 
            if (this.health <= 0) { this.switchSprite('death'); return; }
            this.isBlockHitting = true;
            this.switchSprite('blockHit');
            setTimeout(() => { this.isBlockHitting = false; }, 200);
            return;
        }

        this.health -= 20; 
        this.isStunned = true; 
        
        if (this.health <= 0) this.switchSprite('death');
        else this.switchSprite('hurt', true);
    }

    getStunned() {
        if(this.dead) return;
        this.isStunned = true; 
        this.isAttacking = false; 
        this.switchSprite('hurt', true); 
        this.velocity.x = 0;
    }

    switchSprite(sprite, override = false) {
        if (this.image === this.sprites.death.image && this.dead) return;

        if (!override) {
            if (this.isStunned && sprite !== 'death' && sprite !== 'hurt') return;
            if (this.image === this.sprites.attack1.image && this.framesCurrent < this.sprites.attack1.framesMax - 1) return;
            
            if (this.isBlockHitting) {
                 if(this.image !== this.sprites.blockHit.image) {
                    this.image = this.sprites.blockHit.image; this.framesMax = this.sprites.blockHit.framesMax; this.framesCurrent = 0;
                    if(this.sprites.blockHit.scale) this.scale = this.sprites.blockHit.scale;
                    if(this.sprites.blockHit.offset) this.offset = this.sprites.blockHit.offset;
                 } return;
            }
            
            // BLOK KONTROLÜ
            if (this.isBlocking && !this.isBlockHitting && sprite !== 'death') {
                 if(this.image !== this.sprites.block.image) {
                    this.image = this.sprites.block.image; this.framesMax = this.sprites.block.framesMax; this.framesCurrent = 0;
                    if(this.sprites.block.scale) this.scale = this.sprites.block.scale;
                    if(this.sprites.block.offset) this.offset = this.sprites.block.offset;
                } return;
            }
        }

        if(this.currentSpriteName === sprite && !override) return; 

        switch (sprite) {
            case 'idle':
                if (this.image !== this.sprites.idle.image) { this.image = this.sprites.idle.image; this.framesMax = this.sprites.idle.framesMax; this.framesCurrent = 0; this.framesHold = 3; this.scale = this.defaultScale; if(this.sprites.idle.offset) this.offset = this.sprites.idle.offset; } break;
            case 'run':
                if (this.image !== this.sprites.run.image) { this.image = this.sprites.run.image; this.framesMax = this.sprites.run.framesMax; this.framesCurrent = 0; this.framesHold = 3; this.scale = this.defaultScale; if(this.sprites.run.offset) this.offset = this.sprites.run.offset; } break;
            case 'attack1':
                if (this.image !== this.sprites.attack1.image) { this.image = this.sprites.attack1.image; this.framesMax = this.sprites.attack1.framesMax; this.framesCurrent = 0; this.framesHold = 3; this.scale = this.defaultScale; if(this.sprites.attack1.offset) this.offset = this.sprites.attack1.offset; } break;
            case 'death':
                if (this.image !== this.sprites.death.image) { this.image = this.sprites.death.image; this.framesMax = this.sprites.death.framesMax; this.framesCurrent = 0; this.framesHold = 12; if(this.sprites.death.scale) this.scale = this.sprites.death.scale; if(this.sprites.death.offset) this.offset = this.sprites.death.offset; } break;
            case 'hurt':
                 if (this.image !== this.sprites.hurt.image) {
                    this.image = this.sprites.hurt.image; this.framesMax = this.sprites.hurt.framesMax; this.framesCurrent = 0;
                    this.framesHold = 3;
                    this.scale = this.defaultScale; 
                    if(this.sprites.hurt.offset) this.offset = this.sprites.hurt.offset;
                } break;
            case 'block':
                 if (this.image !== this.sprites.block.image) {
                    this.image = this.sprites.block.image; this.framesMax = this.sprites.block.framesMax; this.framesCurrent = 0;
                    if(this.sprites.block.scale) this.scale = this.sprites.block.scale;
                    if(this.sprites.block.offset) this.offset = this.sprites.block.offset;
                } break;
        }
        this.currentSpriteName = sprite;
    }
}

// ==========================================
// --- AYARLAR ---
// ==========================================

const background = new Sprite({ position: { x: 0, y: 0 }, imgSrc: 'assets/background.png' });
const playerScale = 2.5; 
const commonOffset = { x: 96, y: 52 };
const deathScale = 0.8; 
const deathOffset = { x: 10, y: 10 }; 
const blockScale = 0.6; 
const blockOffset = { x: 60, y: -50 }; 

// --- GÖRSEL YOLLARI ---

const assetsP1 = {
    idle: 'assets/idle.png', 
    run: 'assets/run.png', 
    attack: 'assets/attack.png', 
    hurt: 'assets/hurt.png', 
    die: 'assets/die.png', 
    block: 'assets/block.png', 
    blockHit: 'assets/blockHit.png'
};

const assetsP2 = {
    idle: 'assets/enemy/idle.png', 
    run: 'assets/enemy/run.png', 
    attack: 'assets/enemy/attack.png', 
    hurt: 'assets/enemy/hurt.png', 
    die: 'assets/enemy/die.png', 
    block: 'assets/enemy/block.png', 
    blockHit: 'assets/enemy/blockHit.png'
};

const player = new Fighter({
    position: { x: 100, y: 0 }, velocity: { x: 0, y: 0 }, 
    imgSrc: assetsP1.idle, 
    framesMax: 10, scale: playerScale, offset: commonOffset,
    sprites: {
        idle: { imageSrc: assetsP1.idle, framesMax: 10, offset: commonOffset },
        run: { imageSrc: assetsP1.run, framesMax: 16, offset: commonOffset },
        attack1: { imageSrc: assetsP1.attack, framesMax: 7, offset: commonOffset }, 
        hurt: { imageSrc: assetsP1.hurt, framesMax: 4, offset: commonOffset },
        death: { imageSrc: assetsP1.die, framesMax: 5, scale: deathScale, offset: deathOffset },
        block: { imageSrc: assetsP1.block, framesMax: 1, scale: blockScale, offset: blockOffset },
        blockHit: { imageSrc: assetsP1.blockHit, framesMax: 1, scale: blockScale, offset: blockOffset }
    }
});

const enemy = new Fighter({
    position: { x: 800, y: 100 }, velocity: { x: 0, y: 0 }, color: 'blue', 
    imgSrc: assetsP2.idle, 
    framesMax: 10, scale: playerScale, offset: commonOffset,
    sprites: {
        idle: { imageSrc: assetsP2.idle, framesMax: 10, offset: commonOffset },
        run: { imageSrc: assetsP2.run, framesMax: 16, offset: commonOffset },
        attack1: { imageSrc: assetsP2.attack, framesMax: 7, offset: commonOffset },
        hurt: { imageSrc: assetsP2.hurt, framesMax: 4, offset: commonOffset },
        death: { imageSrc: assetsP2.die, framesMax: 5, scale: deathScale, offset: deathOffset },
        block: { imageSrc: assetsP2.block, framesMax: 1, scale: blockScale, offset: blockOffset },
        blockHit: { imageSrc: assetsP2.blockHit, framesMax: 1, scale: blockScale, offset: blockOffset }
    }
});
enemy.facingRight = false; 

// --- NETWORK SYNC ---
socket.on('playerUpdated', (data) => {
    if (data.role === myRole) return; 

    let target = data.role === 'player1' ? player : enemy;
    target.position.x = data.x; target.position.y = data.y; target.facingRight = data.facingRight; target.velocity.y = data.velocityY;
    
    // Gelen veriye göre Zorla Sprite Değiştir
    if (data.sprite === 'block') { 
        target.isBlocking = true; 
        target.switchSprite('block', true); 
    }
    else if (data.sprite === 'run') { 
        target.isBlocking = false; 
        target.switchSprite('run', true); 
    }
    else { 
        target.isBlocking = false; 
        target.switchSprite('idle', true); 
    }
});

socket.on('enemyAttack', () => { if (myRole === 'player1') enemy.attack(); else player.attack(); });
socket.on('enemyHit', (data) => {
    if (myRole === 'player1' && data.target === 'player1') { player.takeHit(enemy); updateHealthBars(); }
    else if (myRole === 'player2' && data.target === 'player2') { enemy.takeHit(player); updateHealthBars(); }
});

function updateHealthBars() {
    const pHealth = (player.health / 100) * 100;
    const eHealth = (enemy.health / 100) * 100;
    document.querySelector('#playerHealth').style.width = (pHealth < 0 ? 0 : pHealth) + '%';
    document.querySelector('#enemyHealth').style.width = (eHealth < 0 ? 0 : eHealth) + '%';
}

function animate() {
    animationId = window.requestAnimationFrame(animate);
    if(!gameRunning) return; 

    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#2e7d32'; c.fillRect(0, 0, canvas.width, canvas.height);
    background.update(); 
    c.fillStyle = 'rgba(255, 255, 255, 0.2)'; c.fillRect(0, groundLevel, canvas.width, platformHeight);

    player.update(false); 
    enemy.update(true); 

    // --- TEK KONTROL YAPISI ---
    
    let myChar = null;
    if (myRole === 'player1') myChar = player;
    else if (myRole === 'player2') myChar = enemy;

    if (myChar) {
        myChar.velocity.x = 0;
        
        if (!myChar.dead && !myChar.isStunned) {
            // Blokluyorsa
            if (myChar.isBlocking) {
                myChar.switchSprite('block');
            } 
            // Hareket
            else {
                if (keys.a.pressed && myChar.lastKey === 'a') { myChar.velocity.x = -5; myChar.facingRight = false; myChar.switchSprite('run'); }
                else if (keys.d.pressed && myChar.lastKey === 'd') { myChar.velocity.x = 5; myChar.facingRight = true; myChar.switchSprite('run'); }
                else if (keys.a.pressed) { myChar.velocity.x = -5; myChar.facingRight = false; myChar.switchSprite('run'); }
                else if (keys.d.pressed) { myChar.velocity.x = 5; myChar.facingRight = true; myChar.switchSprite('run'); }
                else {
                    myChar.switchSprite('idle');
                }
            }
            
            if (myChar.velocity.y !== 0 && !myChar.isAttacking && !myChar.isStunned) {
                myChar.switchSprite('idle');
            }
        }
        emitMyState(myChar);
    }

    if (myRole === 'player1' && player.isAttacking && player.framesCurrent === 4) {
        if (checkCollision(player, enemy)) { player.isAttacking = false; socket.emit('hit', { target: 'player2' }); enemy.takeHit(player); updateHealthBars(); }
    }
    if (myRole === 'player2' && enemy.isAttacking && enemy.framesCurrent === 4) {
        if (checkCollision(enemy, player)) { enemy.isAttacking = false; socket.emit('hit', { target: 'player1' }); player.takeHit(enemy); updateHealthBars(); }
    }
}

function checkCollision(attacker, target) {
    return (attacker.attackBox.position.x + attacker.attackBox.width >= target.position.x &&
        attacker.attackBox.position.x <= target.position.x + target.width &&
        attacker.attackBox.position.y + attacker.attackBox.height >= target.position.y);
}
function emitMyState(character) {
    socket.emit('updateState', { role: myRole, x: character.position.x, y: character.position.y, velocityY: character.velocity.y, facingRight: character.facingRight, sprite: character.isBlocking ? 'block' : character.currentSpriteName === 'run' ? 'run' : 'idle' });
}

// --- ORTAK KONTROLLER ---
const keys = { a: { pressed: false }, d: { pressed: false } };

window.addEventListener('keydown', (event) => {
    if (!gameRunning) return; 
    
    let me = null;
    if (myRole === 'player1') me = player;
    else if (myRole === 'player2') me = enemy;
    else return;

    if (!me.dead && !me.isStunned) {
        switch (event.key) {
            case 'd': if(!me.isBlocking) { keys.d.pressed = true; me.lastKey = 'd'; } break;
            case 'a': if(!me.isBlocking) { keys.a.pressed = true; me.lastKey = 'a'; } break;
            case 'w': if(!me.isBlocking && me.velocity.y === 0) me.velocity.y = -15; break;
            case ' ': event.preventDefault(); me.attack(); break;
            case 's': 
                me.isBlocking = true; 
                me.canParry = true; 
                me.velocity.x = 0; 
                setTimeout(() => { me.canParry = false; }, 400); 
                break;
        }
    }
});

window.addEventListener('keyup', (event) => {
    if (!gameRunning) return;
    
    let me = null;
    if (myRole === 'player1') me = player;
    else if (myRole === 'player2') me = enemy;
    else return;

    switch (event.key) { 
        case 'd': keys.d.pressed = false; break; 
        case 'a': keys.a.pressed = false; break; 
        case 's': 
            // TUŞU BIRAKINCA BLOK BİTER VE BİLGİ GÖNDERİLİR
            me.isBlocking = false; 
            me.canParry = false; 
            emitMyState(me);
            break; 
    } 
});
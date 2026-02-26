// ui.js - DOM menus: main menu, setup, shop, results, game over

import { WEAPONS, SHOP_ITEMS, PLAYER_COLORS } from './constants.js';

export class UI {
    constructor(game) {
        this.game = game;
        this.overlay = null;
    }

    init() {
        this.overlay = document.getElementById('ui-overlay');
    }

    hideAll() {
        this.overlay.innerHTML = '';
        this.overlay.classList.remove('active');
    }

    _show(html) {
        this.overlay.innerHTML = html;
        this.overlay.classList.add('active');
    }

    showMainMenu() {
        this._show(`
            <div class="menu-panel main-menu">
                <h1 class="game-title">SCORCHED EARTH NG</h1>
                <p class="subtitle">The Mother of All Games</p>
                <div class="menu-buttons">
                    <button class="btn btn-primary" id="btn-play">START GAME</button>
                    <button class="btn btn-secondary" id="btn-quick">QUICK GAME</button>
                    <button class="btn btn-online" id="btn-online">PLAY ONLINE</button>
                </div>
                <div class="controls-info">
                    <h3>Controls</h3>
                    <p><b>←/→</b> Adjust angle &nbsp; <b>↑/↓</b> Adjust power</p>
                    <p><b>Space/Enter</b> Fire &nbsp; <b>Q/E</b> Change weapon</p>
                    <p><b>A/D</b> Move tank (requires fuel)</p>
                </div>
                <div class="version-info">v0.6.5</div>
            </div>
        `);

        document.getElementById('btn-play').onclick = () => {
            this.game.audio.resume();
            this.game.audio.playClick();
            this.showSetup();
        };

        document.getElementById('btn-quick').onclick = () => {
            this.game.audio.resume();
            this.game.audio.playClick();
            this.game.startGame({
                players: [
                    { name: 'Player 1', isAI: false, aiDifficulty: 'easy' },
                    { name: 'CPU', isAI: true, aiDifficulty: 'medium' }
                ],
                rounds: 5
            });
        };

        document.getElementById('btn-online').onclick = () => {
            this.game.audio.resume();
            this.game.audio.playClick();
            this.showOnlineLobby();
        };
    }

    showOnlineLobby() {
        this._show(`
            <div class="menu-panel">
                <h2>PLAY ONLINE</h2>

                <div class="online-section">
                    <label style="color:#aaa; font-size:14px">Your Name:</label><br>
                    <input type="text" class="online-input" id="online-name" value="Player" maxlength="12"
                           style="margin-top:8px; letter-spacing:0; text-align:left">
                </div>

                <div class="online-section">
                    <label style="color:#aaa; font-size:14px">Rounds:</label>
                    <select id="online-rounds" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:6px 10px; border-radius:4px; font-family:'Courier New',monospace; font-size:13px; margin-left:8px">
                        <option value="3">3</option>
                        <option value="5" selected>5</option>
                        <option value="7">7</option>
                        <option value="10">10</option>
                    </select>
                </div>

                <div class="online-section">
                    <h3>Create a Room</h3>
                    <button class="btn btn-primary" id="btn-host">HOST GAME</button>
                    <div class="online-status" id="host-status"></div>
                </div>

                <div class="online-divider">OR</div>

                <div class="online-section">
                    <h3>Join a Room</h3>
                    <input type="text" class="online-input" id="join-code" placeholder="Enter room code (SE-XXXXXX)" maxlength="9">
                    <br><br>
                    <button class="btn btn-primary" id="btn-join">JOIN GAME</button>
                    <div class="online-status" id="join-status"></div>
                </div>

                <div class="menu-buttons">
                    <button class="btn btn-secondary" id="btn-back-online">BACK</button>
                </div>
            </div>
        `);

        document.getElementById('btn-host').onclick = async () => {
            const name = document.getElementById('online-name').value.trim() || 'Host';
            const rounds = parseInt(document.getElementById('online-rounds').value);
            const statusEl = document.getElementById('host-status');
            statusEl.textContent = 'Creating room...';
            statusEl.className = 'online-status';

            try {
                await this.game.hostOnlineGame(name, rounds);
            } catch (err) {
                statusEl.textContent = 'Failed: ' + err.message;
                statusEl.className = 'online-status error';
            }
        };

        document.getElementById('btn-join').onclick = async () => {
            const name = document.getElementById('online-name').value.trim() || 'Guest';
            const code = document.getElementById('join-code').value.trim();
            const statusEl = document.getElementById('join-status');

            if (!code) {
                statusEl.textContent = 'Enter a room code';
                statusEl.className = 'online-status error';
                return;
            }

            statusEl.textContent = 'Connecting...';
            statusEl.className = 'online-status';

            try {
                await this.game.joinOnlineGame(code, name);
            } catch (err) {
                statusEl.textContent = 'Failed: ' + err.message;
                statusEl.className = 'online-status error';
            }
        };

        document.getElementById('btn-back-online').onclick = () => {
            this.game.audio.playClick();
            this.showMainMenu();
        };
    }

    showHostWaiting(roomCode) {
        this._show(`
            <div class="menu-panel">
                <h2>WAITING FOR OPPONENT</h2>
                <p style="color:#aaa; margin-bottom:10px">Share this code with your friend:</p>
                <div class="room-code">${roomCode}</div>
                <p style="color:#666; font-size:12px; margin-top:5px">Click the code to select it</p>
                <div class="online-status" id="host-wait-status" style="margin-top:15px">
                    Waiting for player to join...
                </div>
                <div class="menu-buttons">
                    <button class="btn btn-secondary" id="btn-cancel-host">CANCEL</button>
                </div>
            </div>
        `);

        document.getElementById('btn-cancel-host').onclick = () => {
            this.game.audio.playClick();
            this.game._destroyOnline();
            this.showOnlineLobby();
        };
    }

    showOnlineShop(tank, onDone) {
        const color = PLAYER_COLORS[tank.playerIndex];

        const renderShop = () => {
            let weaponsHtml = '';
            for (const [key, weapon] of Object.entries(WEAPONS)) {
                if (key === 'basic') continue;
                const owned = tank.weapons[key] || 0;
                const canBuy = tank.money >= weapon.price;
                weaponsHtml += `
                    <div class="shop-item ${canBuy ? '' : 'disabled'}">
                        <div class="shop-item-info">
                            <span class="shop-item-name">${weapon.name}</span>
                            <span class="shop-item-desc">${weapon.description}</span>
                        </div>
                        <div class="shop-item-right">
                            <span class="shop-item-owned">${owned > 0 ? `×${owned}` : ''}</span>
                            <span class="shop-item-price">$${weapon.price.toLocaleString()}</span>
                            <button class="btn btn-small btn-buy" data-type="weapon" data-key="${key}"
                                    ${canBuy ? '' : 'disabled'}>BUY</button>
                        </div>
                    </div>
                `;
            }

            let itemsHtml = '';
            for (const [key, item] of Object.entries(SHOP_ITEMS)) {
                const canBuy = tank.money >= item.price;
                itemsHtml += `
                    <div class="shop-item ${canBuy ? '' : 'disabled'}">
                        <div class="shop-item-info">
                            <span class="shop-item-name">${item.name}</span>
                            <span class="shop-item-desc">${item.description}</span>
                        </div>
                        <div class="shop-item-right">
                            <span class="shop-item-price">$${item.price.toLocaleString()}</span>
                            <button class="btn btn-small btn-buy" data-type="item" data-key="${key}"
                                    ${canBuy ? '' : 'disabled'}>BUY</button>
                        </div>
                    </div>
                `;
            }

            this._show(`
                <div class="menu-panel shop-panel">
                    <h2 style="color:${color.main}">SHOP - ${tank.name}</h2>
                    <div class="shop-money">Balance: <span class="money-amount">$${tank.money.toLocaleString()}</span></div>

                    <div class="shop-section">
                        <h3>Weapons</h3>
                        ${weaponsHtml}
                    </div>

                    <div class="shop-section">
                        <h3>Items</h3>
                        ${itemsHtml}
                    </div>

                    <div class="menu-buttons">
                        <button class="btn btn-primary" id="btn-done-online-shop">DONE SHOPPING</button>
                    </div>
                </div>
            `);

            this.overlay.querySelectorAll('.btn-buy').forEach(btn => {
                btn.onclick = () => {
                    const type = btn.dataset.type;
                    const key = btn.dataset.key;
                    let success = false;

                    if (type === 'weapon') {
                        success = tank.buyWeapon(key, WEAPONS[key].price);
                    } else {
                        success = tank.buyItem(key, SHOP_ITEMS[key]);
                    }

                    if (success) {
                        this.game.audio.playBuy();
                        renderShop();
                    }
                };
            });

            document.getElementById('btn-done-online-shop').onclick = () => {
                this.game.audio.playClick();
                onDone();
            };
        };

        renderShop();
    }

    showOnlineWaiting(msg) {
        this._show(`
            <div class="menu-panel">
                <div class="online-waiting">${msg}</div>
            </div>
        `);
    }

    setOnlineOverlay(msg) {
        const el = document.getElementById('online-overlay');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.classList.add('visible');
        } else {
            el.textContent = '';
            el.classList.remove('visible');
        }
    }

    showSetup() {
        this._show(`
            <div class="menu-panel setup-panel">
                <h2>GAME SETUP</h2>
                <div class="setup-section">
                    <label>Rounds: <select id="setup-rounds">
                        <option value="3">3</option>
                        <option value="5" selected>5</option>
                        <option value="7">7</option>
                        <option value="10">10</option>
                    </select></label>
                </div>

                <div class="setup-section">
                    <label>Number of Players: <select id="setup-count">
                        <option value="2" selected>2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                    </select></label>
                </div>

                <div id="player-config" class="player-config"></div>

                <div class="menu-buttons">
                    <button class="btn btn-primary" id="btn-start">START</button>
                    <button class="btn btn-secondary" id="btn-back">BACK</button>
                </div>
            </div>
        `);

        const countSelect = document.getElementById('setup-count');
        const configDiv = document.getElementById('player-config');

        const renderPlayers = () => {
            const count = parseInt(countSelect.value);
            let html = '';
            for (let i = 0; i < count; i++) {
                const color = PLAYER_COLORS[i];
                html += `
                    <div class="player-setup-row" style="border-left: 4px solid ${color.main}">
                        <input type="text" class="player-name" id="pname-${i}"
                               value="${i === 0 ? 'Player 1' : 'CPU ' + i}" maxlength="12">
                        <select class="player-type" id="ptype-${i}">
                            <option value="human" ${i === 0 ? 'selected' : ''}>Human</option>
                            <option value="easy" ${i > 0 ? '' : ''}>AI Easy</option>
                            <option value="medium" ${i > 0 ? 'selected' : ''}>AI Medium</option>
                            <option value="hard">AI Hard</option>
                        </select>
                    </div>
                `;
            }
            configDiv.innerHTML = html;
        };

        countSelect.onchange = renderPlayers;
        renderPlayers();

        document.getElementById('btn-start').onclick = () => {
            const count = parseInt(countSelect.value);
            const rounds = parseInt(document.getElementById('setup-rounds').value);
            const players = [];
            for (let i = 0; i < count; i++) {
                const name = document.getElementById(`pname-${i}`).value || `Player ${i + 1}`;
                const type = document.getElementById(`ptype-${i}`).value;
                players.push({
                    name,
                    isAI: type !== 'human',
                    aiDifficulty: type === 'human' ? 'easy' : type
                });
            }
            this.game.audio.playClick();
            this.game.startGame({ players, rounds });
        };

        document.getElementById('btn-back').onclick = () => {
            this.game.audio.playClick();
            this.showMainMenu();
        };
    }

    showShop(players) {
        const humanPlayers = players.filter(p => !p.isAI);
        const shopPlayers = humanPlayers.length > 0 ? humanPlayers : players;

        let currentIdx = 0;

        const renderShop = () => {
            const tank = shopPlayers[currentIdx];
            const color = PLAYER_COLORS[tank.playerIndex];

            let weaponsHtml = '';
            for (const [key, weapon] of Object.entries(WEAPONS)) {
                if (key === 'basic') continue;
                const owned = tank.weapons[key] || 0;
                const canBuy = tank.money >= weapon.price;
                weaponsHtml += `
                    <div class="shop-item ${canBuy ? '' : 'disabled'}">
                        <div class="shop-item-info">
                            <span class="shop-item-name">${weapon.name}</span>
                            <span class="shop-item-desc">${weapon.description}</span>
                        </div>
                        <div class="shop-item-right">
                            <span class="shop-item-owned">${owned > 0 ? `×${owned}` : ''}</span>
                            <span class="shop-item-price">$${weapon.price.toLocaleString()}</span>
                            <button class="btn btn-small btn-buy" data-type="weapon" data-key="${key}"
                                    ${canBuy ? '' : 'disabled'}>BUY</button>
                        </div>
                    </div>
                `;
            }

            let itemsHtml = '';
            for (const [key, item] of Object.entries(SHOP_ITEMS)) {
                const canBuy = tank.money >= item.price;
                itemsHtml += `
                    <div class="shop-item ${canBuy ? '' : 'disabled'}">
                        <div class="shop-item-info">
                            <span class="shop-item-name">${item.name}</span>
                            <span class="shop-item-desc">${item.description}</span>
                        </div>
                        <div class="shop-item-right">
                            <span class="shop-item-price">$${item.price.toLocaleString()}</span>
                            <button class="btn btn-small btn-buy" data-type="item" data-key="${key}"
                                    ${canBuy ? '' : 'disabled'}>BUY</button>
                        </div>
                    </div>
                `;
            }

            this._show(`
                <div class="menu-panel shop-panel">
                    <h2 style="color:${color.main}">SHOP - ${tank.name}</h2>
                    <div class="shop-money">Balance: <span class="money-amount">$${tank.money.toLocaleString()}</span></div>

                    <div class="shop-section">
                        <h3>Weapons</h3>
                        ${weaponsHtml}
                    </div>

                    <div class="shop-section">
                        <h3>Items</h3>
                        ${itemsHtml}
                    </div>

                    <div class="menu-buttons">
                        ${shopPlayers.length > 1 && currentIdx < shopPlayers.length - 1
                            ? '<button class="btn btn-primary" id="btn-next-player">NEXT PLAYER</button>'
                            : '<button class="btn btn-primary" id="btn-done-shop">CONTINUE</button>'}
                    </div>
                </div>
            `);

            // Attach buy handlers
            this.overlay.querySelectorAll('.btn-buy').forEach(btn => {
                btn.onclick = () => {
                    const type = btn.dataset.type;
                    const key = btn.dataset.key;
                    let success = false;

                    if (type === 'weapon') {
                        success = tank.buyWeapon(key, WEAPONS[key].price);
                    } else {
                        success = tank.buyItem(key, SHOP_ITEMS[key]);
                    }

                    if (success) {
                        this.game.audio.playBuy();
                        renderShop(); // Re-render to update money and counts
                    }
                };
            });

            const nextBtn = document.getElementById('btn-next-player');
            if (nextBtn) {
                nextBtn.onclick = () => {
                    this.game.audio.playClick();
                    currentIdx++;
                    renderShop();
                };
            }

            const doneBtn = document.getElementById('btn-done-shop');
            if (doneBtn) {
                doneBtn.onclick = () => {
                    this.game.audio.playClick();
                    this.game.finishShopping();
                };
            }
        };

        renderShop();
    }

    showGameOver(players) {
        const sorted = [...players].sort((a, b) => b.score - a.score);

        let rows = '';
        sorted.forEach((p, i) => {
            const color = PLAYER_COLORS[p.playerIndex];
            const medal = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
            rows += `
                <tr style="color: ${color.main}">
                    <td>${medal}</td>
                    <td>${p.name}</td>
                    <td>${p.score.toLocaleString()}</td>
                    <td>${p.kills}</td>
                    <td>${p.roundsWon}</td>
                    <td>$${p.money.toLocaleString()}</td>
                </tr>
            `;
        });

        const winner = sorted[0];
        const winColor = PLAYER_COLORS[winner.playerIndex];

        this._show(`
            <div class="menu-panel gameover-panel">
                <h1 style="color:${winColor.main}">🏆 ${winner.name} WINS! 🏆</h1>

                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Score</th>
                            <th>Kills</th>
                            <th>Rounds Won</th>
                            <th>Money</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>

                <div class="menu-buttons">
                    <button class="btn btn-primary" id="btn-play-again">PLAY AGAIN</button>
                    <button class="btn btn-secondary" id="btn-main-menu">MAIN MENU</button>
                </div>
            </div>
        `);

        document.getElementById('btn-play-again').onclick = () => {
            this.game.audio.playClick();
            this.showSetup();
        };

        document.getElementById('btn-main-menu').onclick = () => {
            this.game.audio.playClick();
            this.showMainMenu();
        };
    }
}

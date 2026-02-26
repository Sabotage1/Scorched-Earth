// network.js - PeerJS wrapper for online multiplayer

export class Network {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.roomCode = '';
        this.isHost = false;
        this.connected = false;

        // Callbacks
        this.onMessage = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;
    }

    _generateRoomCode() {
        // Exclude ambiguous chars: O/0/I/1/l
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'SE-';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    async host() {
        this.isHost = true;
        this.roomCode = this._generateRoomCode();

        return new Promise((resolve, reject) => {
            this.peer = new Peer(this.roomCode, {
                debug: 0
            });

            this.peer.on('open', () => {
                resolve(this.roomCode);
            });

            this.peer.on('connection', (conn) => {
                this.conn = conn;
                this._setupConnection(conn);
            });

            this.peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    // Room code collision, try again
                    this.peer.destroy();
                    this.roomCode = this._generateRoomCode();
                    this.peer = new Peer(this.roomCode, { debug: 0 });
                    this.peer.on('open', () => resolve(this.roomCode));
                    this.peer.on('connection', (conn) => {
                        this.conn = conn;
                        this._setupConnection(conn);
                    });
                    this.peer.on('error', (e) => {
                        if (this.onError) this.onError(e);
                        reject(e);
                    });
                } else {
                    if (this.onError) this.onError(err);
                    reject(err);
                }
            });
        });
    }

    async join(code) {
        this.isHost = false;
        this.roomCode = code.toUpperCase().trim();

        return new Promise((resolve, reject) => {
            this.peer = new Peer(undefined, {
                debug: 0
            });

            this.peer.on('open', () => {
                const conn = this.peer.connect(this.roomCode, { reliable: true });
                this.conn = conn;
                this._setupConnection(conn);

                conn.on('open', () => {
                    resolve();
                });
            });

            this.peer.on('error', (err) => {
                if (this.onError) this.onError(err);
                reject(err);
            });

            // Timeout for connection
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timed out'));
                }
            }, 15000);
        });
    }

    _setupConnection(conn) {
        conn.on('open', () => {
            this.connected = true;
            if (this.onConnected) this.onConnected();
        });

        conn.on('data', (data) => {
            if (this.onMessage && data && data.type) {
                this.onMessage(data.type, data.payload);
            }
        });

        conn.on('close', () => {
            this.connected = false;
            if (this.onDisconnected) this.onDisconnected();
        });

        conn.on('error', (err) => {
            if (this.onError) this.onError(err);
        });
    }

    send(type, payload) {
        if (this.conn && this.connected) {
            this.conn.send({ type, payload });
        }
    }

    destroy() {
        this.connected = false;
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.onMessage = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;
    }
}

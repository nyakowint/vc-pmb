import { Server, createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { WebSocketServer, WebSocket } from 'ws';
import { PresenceData } from './types/presence';
import { MessageEvent } from 'ws';
import { IPC } from './ipc';

let io: SocketIOServer;
let httpServer: Server;
let wsServer: WebSocketServer;
let ws: WebSocket;
let wsConnected = false;

const logError = (s: string) => console.warn(s);
const log = (s: string) => console.log(s);

const ipc = new IPC("1192278906850516992")
ipc.login()

function init() {
    log("[Info] Starting PreMid Vencord bridge")
    return new Promise<void>(resolve => {
        httpServer = createServer();
        if (ws) ws.close();
        wsServer = new WebSocketServer({ port: 4020 });
        wsServer.once('connection', function connection(real: WebSocket) {
            ws = real;
            console.log("[Info] Discord client connected! (WS)");
            wsConnected = true;
            io = new SocketIOServer(httpServer, {
                serveClient: false,
                allowEIO3: true,
                cors: { origin: '*' }
            });
            httpServer.listen(3020, () => {
                resolve();
                log('[Info] SocketIO starting on 3020');
            });
            httpServer.on('error', onIOError);
            io.on('connection', onConnect);
            ws.onclose = onSocketDisconnect;
        });
        wsServer.on('connection', function connection(real: WebSocket) {
            ws = real;
            console.log("[Info] Discord client connected! (WS)");
            wsConnected = true;
        });
    });
}

function onConnect(sio: Socket) {
    log('[Info] SocketIO connected');

    // Extension requests Premid version
    sio.on('getVersion', () => {
        log('[Ext] Extension requested version, sending 2.2.0');
        sio.emit('receiveVersion', '2.2.0'.replace(/[\D]/g, ''))
        // Get current user from plugin & send to extension
        ws.send(JSON.stringify({ type: "getCurrentUser", data: {} }));
    });


    ws.onmessage = async (m: MessageEvent) => {
        let msg = JSON.parse(m.data.toString());
        if (msg.type === 'currentUser') {
            log('[Info] Received current user, sending to ext');
            let user = msg.user;
            user.phone = ""
            user.email = ""
            sio.emit('discordUser', user);
        }
    };

    sio.on('setActivity', setActivity);
    sio.on('clearActivity', clearActivity);

    sio.on('selectLocalPresence', () => { logError("Selecting local presence is not supported") });

    sio.once('disconnect', () => onIoDisconnect());
}

async function onIoDisconnect() {
    logError('[Info] SocketIO disconnected');
    clearActivity();
}

async function onSocketDisconnect() {
    logError('[Info] Discord client (WS) disconnected');
    wsConnected = false;
}

function onIOError(e: { message: any; code: string; }) {
    logError(`SocketIO: ${e.message}`);

    if (e.code === 'EADDRINUSE') {
        logError("PreMid port already in use!");
    }
}

const timestamps: number[] = [];

function checkRateLimit(): boolean {
    const now = Date.now();

    while (timestamps.length > 0 && timestamps[0] <= now - 3000) {
        timestamps.shift();
    }

    if (timestamps.length < 3) {
        timestamps.push(now);
        return true;
    }
    return false;
}

const setActivity = async (pres: PresenceData) => {
    if (!checkRateLimit() || !wsConnected) return;
    let id = pres.clientId;
    let pr = { ...pres.presenceData }
    if (!id || !pr.details) return;
    log(`[Presence] Setting activity of "${pr.details}" - ${Date.now()}`);
    let msg = {
        type: "setActivity",
        data: {
            state: pr.state,
            details: pr.details,
            timestamps: {
                start: pr.startTimestamp,
                end: pr.endTimestamp
            },
            assets: {
                large_image: pr.largeImageKey,
                large_text: pr.largeImageText,
                small_image: pr.smallImageKey,
                small_text: pr.smallImageText
            },
            buttons: pr.buttons?.map(b => b.label),
            application_id: id,
            metadata: {
                button_urls: pr.buttons?.map(b => b.url)
            },
            type: 0,
            flags: 1 << 0
        }
    };

    ws.send(JSON.stringify(msg));
};

const clearActivity = () => {
    log('[Presence] Clearing activity');
    let clear = {
        type: "clearActivity",
        data: {}
    };
    ws.send(JSON.stringify(clear));
};

init();

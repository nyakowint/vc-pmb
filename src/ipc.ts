// yoinked from https://github.com/Jade3375/RichCord/blob/main/src/IPC/IPCClient.ts
import * as net from "net"
import { EventEmitter } from "ws"

export class IPC extends EventEmitter {
    id: string
    socket: any
    logging: boolean
    ready: boolean

    private working = {
        full: '',
        op: undefined
    }

    OPCodes = {
        HANDSHAKE: 0,
        FRAME: 1,
        CLOSE: 2,
        PING: 3,
        PONG: 4,
    };

    public constructor(id: string) {
        super()

        this.id = id
        this.socket = null
        this.logging = true
        this.ready = false
    }

    /**
     *
     * @param op {number} OPCode to send
     * @param data {JSON} json encoded string
     * @returns {Buffer} Buffer
     */
    public encode(op: number, data: any): Buffer {
        data = JSON.stringify(data);
        const len = Buffer.byteLength(data);
        const packet = Buffer.alloc(8 + len);
        packet.writeInt32LE(op, 0);
        packet.writeInt32LE(len, 4);
        packet.write(data, 8, len);
        return packet;
    }

    private getIPCPath(id: number) {
        if (process.platform === 'win32') {
            return `\\\\?\\pipe\\discord-ipc-${id}`;
        }
        const { env: { XDG_RUNTIME_DIR, TMPDIR, TMP, TEMP } } = process;
        const prefix = XDG_RUNTIME_DIR || TMPDIR || TMP || TEMP || '/tmp';
        return `${prefix.replace(/\/$/, '')}/discord-ipc-${id}`;
    }


    private getIPC(id = 0) {
        return new Promise<net.Socket>((resolve: any, reject) => {
            let path = this.getIPCPath(id);
            let onerror = () => {
                if (id < 10) {
                    resolve(this.getIPC(id + 1))
                } else {
                    reject(new Error('Could not connect'))
                }
            }
            const sock = net.createConnection(path, () => {
                sock.removeListener('error', onerror);
                resolve(sock)
            })
            sock.once('error', onerror)
        })
    }

    /**
     *
     * @param socket {net.Socket} socket connection for client
     * @param callback {JSON} callback function
     */
    private decode(socket: any, callback: any) {
        let packet = socket.read()
        if (!packet) {
            return
        }
        let { op } = this.working
        let raw: string
        if (this.working.full === '') {
            op = this.working.op = packet.readInt32LE(0);
            const len = packet.readInt32LE(4)
            raw = packet.slice(8, len + 8)
        } else {
            raw = packet.toString()
        }

        try {
            const data = JSON.parse(this.working.full + raw)
            callback({ op, data });
            this.working.full = ''
            this.working.op = undefined
        } catch (err) {
            this.working.full += raw
        }
        this.decode(socket, callback)
    }

    public send(body: any) {
        try {
            this.socket.write(this.encode(this.OPCodes.FRAME, body))
        } catch (err) {
            console.error(err)
        }
    }

    // connects to the discord IPC server
    public async login() {
        console.log("[IPC] Connecting to Discord IPC")
        this.socket = await this.getIPC()

        // handshake with IPC socket
        this.socket.write(this.encode(this.OPCodes.HANDSHAKE, {
            v: 1,
            client_id: this.id
        }))

        this.socket.pause()

        // incoming socket data
        this.socket.on('readable', () => {
            this.decode(this.socket, ({ op, data }: any) => {
                if (this.ready == false) {
                    this.emit("ready")
                    this.ready = true
                }

                switch (op) {
                    case this.OPCodes.PING:
                        this.socket.write(this.encode(this.OPCodes.PING, data))
                        break;
                    case this.OPCodes.CLOSE:
                        console.log("[IPC] Discord IPC closed")
                        this.socket.destroy()
                        break;
                    default:
                        break;
                }
            })
        })
    }

}

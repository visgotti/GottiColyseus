import {IConnectorClient} from "./IConnectorClient";
import {Client} from "gotti-channels/dist";
import * as WebSocket from 'ws';
const msgpack = require('notepack.io');

export class WebSocketConnectorClient implements IConnectorClient {
    upgradeReq?: any;
    auth?: any;
    seatOptions?: any;
    public closingForWebRTC?: boolean = false;
    readonly websocket: WebSocket;
    constructor(websocket: WebSocket, channelClient?: Client) {
        this.websocket = websocket;
        websocket.gottiClient = this;
        this.channelClient = channelClient;
        this.on = websocket.on.bind(websocket);
        this.once = websocket.once.bind(websocket);
        this.removeAllListeners = websocket.removeAllListeners.bind(websocket);
        this.close = websocket.close.bind(websocket);
        this.send = websocket.send.bind(websocket);
    }
    joinedOptions?: any;
    joinOptions?: any;
    channelClient: Client;
    gottiId: string;
    id: string;
    options: any;
    p2p_capable: boolean;
    p2p_enabled: boolean;
    pingCount: number;
    playerIndex: number;
    sessionId: string;
    close() {}
    on(message: string, cb: (data: any) => void): void {}
    once(message: string, cb: (data: any) => void): void {}
    removeAllListeners(message?: string): void {}
    send(message: string) : void {};
    sendReliable(message: Array<any> | Buffer, ordered=false, opts?: { retryRate?: number, firstRetryRate?: number } ) : void {
        this.send(msgpack.encode(message));
    };
    state: "open" | "closed";
}
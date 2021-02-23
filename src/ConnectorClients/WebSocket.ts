import {IConnectorClient} from "./IConnectorClient";
import {Client} from "gotti-channels/dist";
import * as WebSocket from 'ws';

export class WebSocketConnectorClient extends WebSocket implements IConnectorClient {
    upgradeReq?: any;
    auth?: any;
    seatOptions?: any;
    constructor(channelClient?: Client) {
        super();
        this.channelClient = channelClient;
        this.on = super.on.bind(this);
        this.once = super.once.bind(this);
        this.removeAllListeners = super.removeAllListeners.bind(this);
        this.close = super.close.bind(this);
        this.send = super.send.bind(this);
    }

    channelClient: Client;
    gottiId: string;
    id: string;
    joinOptions: any;
    options: any;
    p2p_capable: boolean;
    p2p_enabled: boolean;
    pingCount: number;
    playerIndex: number;
    sessionId: string;
    close() {}

    on(message: string, cb: (data: any) => void): void {}
    once(message: string, cb: (data: any) => void): void {}
    removeAllListeners(message: string): void {}
    send(message: string) : void {};

    state: "open" | "closed";
}
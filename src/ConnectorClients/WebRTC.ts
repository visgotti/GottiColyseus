import {IConnectorClient} from "./IConnectorClient";
import {Client} from "gotti-channels/dist";
import {EventEmitter} from "events";
import nodeDataChannel from "node-datachannel";

export class WebRTCConnectorClient extends EventEmitter implements IConnectorClient {
    public peerConnection : nodeDataChannel.PeerConnection
    constructor(peerConnection: nodeDataChannel.PeerConnection, channelClient?: Client) {
        super();
        this.peerConnection = peerConnection;
        this.channelClient = channelClient;
    }
    channelClient: Client;
    close(reason: number | undefined): void {
    }

    public async completeIceGathering() {
    }

    gottiId: string;
    id: string;
    joinOptions: any;


    options: any;
    p2p_capable: boolean;
    p2p_enabled: boolean;
    pingCount: number;
    playerIndex: number;

    sessionId: string;
    state: "open" | "closed";

    send(message: string): void {
    }
}
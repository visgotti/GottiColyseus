import { BackMaster } from 'gotti-channels/dist';
import { ServerURI } from "./Connector";
export declare type PlayerData = {
    gottiId: string;
    connectorId: string;
    p2p: boolean;
};
export declare type RelayServerOptions = {
    connectorURIs: Array<ServerURI>;
    relayURI: ServerURI;
};
export declare class RelayServer {
    masterChannel: BackMaster;
    private channel;
    private clientMap;
    constructor(options: RelayServerOptions);
    private registerBackChannelMessages;
    private handlePlayerDisconnected;
    private handlePeerFailedConnection;
    private handlePeerConnection;
    private handlePeerConnectionRequest;
}

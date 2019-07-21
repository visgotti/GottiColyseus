import { BackMaster } from 'gotti-channels/dist';
export declare type PlayerData = {
    gottiId: string;
    connectorId: string;
    p2p: boolean;
};
export declare type RelayServerOptions = {
    connectorURIs: Array<string>;
    relayURI: string;
};
export declare class RelayServer {
    masterChannel: BackMaster;
    private channel;
    private clientMap;
    constructor(options: RelayServerOptions);
    private registerBackChannelMessages;
    private handlePeerConnection;
    private handlePeerConnectionRequest;
}

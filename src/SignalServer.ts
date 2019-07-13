import { BackChannel, BackMaster } from 'gotti-channels/dist';
import {Protocol, SIGNAL_SERVER_ID } from "./Protocol";
import {AreaOption} from "./AreaServer";
import {AreaRoom} from "./AreaRoom";


export type PlayerData = {
    gottiId: string,
    connectorId: string,
    sdp: any,
    ice: any,
}

export type SignalServerOptions = {
    serverIndex: number,
    connectorURIs: Array<string>;
    areaURI: string;
}

class SignalServer {
    public masterChannel: BackMaster = null;
    private channel: BackChannel = null;

    private playerIndexToSignalData: any = {};

    private p2pConnectionMap: any = {};

    private currentConnections: Array<string> = [];

    constructor(options: SignalServerOptions) {
        this.masterChannel = new BackMaster(options.serverIndex);
        this.masterChannel.initialize(options.areaURI, options.connectorURIs);
        this.masterChannel.addChannels([SIGNAL_SERVER_ID]);
        this.channel = this.masterChannel.backChannels[SIGNAL_SERVER_ID]
    }

    private registerBackChannelMessages() {
        this.channel.onMessage((message) => {
            if (message[0] === Protocol.REQUEST_PEER_CONNECTION) {
                //    this.onMessage();
                // [requesterPlayerIndex, responderPlayerIndex, connectorId]
                this.handleRequestedPeerConnection(message[1], message[2], message[3]);
                //  this.onMessage(message[1]);
            } else if (message[0] === Protocol.ENABLED_CLIENT_P2P) { // [protocol, frontUid, playerIndex, gottiId, sdp, ice]
                this.playerIndexToSignalData[message[1]] = {
                    connectorId: message[2],
                    gottiId: message[3],
                    sdp: message[4],
                    ice: message[5],
                }
            } else if (message[1] === Protocol.DISABLED_CLIENT_P2P) {
                // [protocol, playerindex]
                this.handleRemovePlayerConnections[message[1]]
            }
        });
    }

    private handleRemovePlayerConnections(playerIndex) {
        /*
        if(this.playerIndexToConnections[playerIndex]) {
            this.playerIndexToConnections[playerIndex].forEach(connection => {
                connection.break();
            })
        }*/
        let connections = this.p2pConnectionMap[playerIndex];
        let len = connections.length;
        while(len--) {
            connections[len].splice(connections[len].indexOf(playerIndex),1);
        }
        delete this.playerIndexToSignalData[playerIndex];
    }

    private handleRequestedPeerConnection(requesterPlayerIndex, responderPlayerIndex, connectorId) {
        if(!(requesterPlayerIndex in this.playerIndexToSignalData) || !(responderPlayerIndex in this.playerIndexToSignalData)) {
            this.channel.send([Protocol.REQUEST_PEER_CONNECTION_FAILED, requesterPlayerIndex, responderPlayerIndex], connectorId)
        } else {
            let { connectorId, gottiId, sdp, ice } = this.playerIndexToSignalData[requesterPlayerIndex];
            const requesterConnectorId = connectorId;
            const sendRequesterData = [gottiId, sdp, ice];

            ({connectorId, gottiId, sdp, ice } = this.playerIndexToSignalData[responderPlayerIndex]);
            const responderConnectorId = connectorId;
            const sendResponderData = [gottiId, sdp, ice];

            this.p2pConnectionMap[requesterPlayerIndex].push(responderPlayerIndex);
            this.p2pConnectionMap[responderPlayerIndex].push(requesterPlayerIndex);
            if(requesterConnectorId === responderConnectorId) {
                this.channel.send([Protocol.REQUEST_PEER_CONNECTION_SUCCEEDED, sendRequesterData, sendResponderData], requesterConnectorId)
            } else {
                this.channel.broadcast([Protocol.REQUEST_PEER_CONNECTION_SUCCEEDED, sendRequesterData, sendResponderData], [requesterConnectorId, responderPlayerIndex]);
            }
        }
    }
}
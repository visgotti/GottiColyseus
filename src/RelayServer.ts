// Relay Server serves 2 purposes
// 1. it acts as a signaling server for client p2p connections to communicate the signals between them even when on seperate connector servers
// 2. if a client wants to send a p2p message the relay server will act as a middleground and find which connector server a peer lives on the forward the message

import {BackChannel, BackMaster} from 'gotti-channels/dist';
import {Protocol, GOTTI_RELAY_SERVER_INDEX, GOTTI_RELAY_CHANNEL_ID} from "./Protocol"
import {ServerURI} from "./Connector";

export type PlayerData = {
    gottiId: string,
    connectorId: string,
    p2p: boolean,
}

export type RelayServerOptions = {
    connectorURIs: Array<ServerURI>;
    relayURI: ServerURI;
}

export class RelayServer {
    public masterChannel: BackMaster = null;
    private channel: BackChannel = null;

    private clientMap: any = {};

    constructor(options: RelayServerOptions) {
        this.masterChannel = new BackMaster(GOTTI_RELAY_SERVER_INDEX);
        this.masterChannel.initialize(options.relayURI.public, options.connectorURIs.map(c => c.public));
        this.masterChannel.addChannels([GOTTI_RELAY_CHANNEL_ID]);
        this.channel = this.masterChannel.backChannels[GOTTI_RELAY_CHANNEL_ID];
        this.registerBackChannelMessages();
    }

    private registerBackChannelMessages() {
        this.channel.onMessage((message) => {
            const protocol = message[0];
            if (protocol === Protocol.CLIENT_WEB_RTC_ENABLED) {
                //    console.log('RelayServer handling CLIENT_WEB_RTC_ENABLED, playerIndex was', message[1]);
                // [protocol,  playerIndex]
                if (this.clientMap[message[1]]) {
                    //  console.log('RelayServer handling CLIENT_WEB_RTC_ENABLED enabled p2p!');
                    this.clientMap[message[1]].p2p = true;
                } else {
                    throw new Error('ENABLED_CLIENT_P2P failed because player index was not in client map')
                }
            } else if (protocol === Protocol.SIGNAL_REQUEST) {
                //    this.onMessage();
                // [protocol, toPlayerIndex, { sdp, candidate  }, fromPlayerIndex, frontUid]

                this.handlePeerConnection(message[1], message[2], message[3], message[4]);
                //  this.onMessage(message[1]);
            } else if (protocol === Protocol.SIGNAL_FAILED) {
                // [protocol, toPlayerIndex, fromPlayerIndex]
                this.handlePeerFailedConnection(message[1], message[2]);
            }else if(protocol === Protocol.PEER_CONNECTION_REQUEST) {
                // [protocol, toPlayerIndex, { sdp, candidate  }, fromSystemName, requestOptions, fromPlayerIndex, frontUid]
                this.handlePeerConnectionRequest(message[1], message[2], message[3], message[4], message[5], message[6])
            } else if (protocol === Protocol.DISABLED_CLIENT_P2P) {
                // [protocol, playerindex]
                const clientData = this.clientMap[message[1]];
                if (clientData) {
                    if (clientData.p2p) {
                        clientData.p2p = false;
                    }
                }
            } else if (protocol === Protocol.JOIN_CONNECTOR) {
                //     console.log('RelayServer handling JOIN_CONNECTOR, p2p_capapable was:', message[1], 'playerIndex was', message[2], 'gottiId was', message[3], 'connectorId was', message[4]);
                this.clientMap[message[2]] = {
                    p2p: message[1],
                    gottiId: message[3],
                    connectorId: message[4],
                }
            } else if (protocol === Protocol.LEAVE_CONNECTOR) {
                // this.relayChannel.send([Protocol.LEAVE_CONNECTOR, client.playerIndex]);
                //TODO: since we dont need additional logic we just remove the player index from client map as is
                // this.handlePlayerDisconnected(message[1]);
                delete this.clientMap[message[1]];
            } else if (protocol === Protocol.PEER_REMOTE_SYSTEM_MESSAGE) {
                //[Protocol.PEER_REMOTE_SYSTEM_MESSAGE, peerIndex, message.type, message.data, message.to, message.from, playerIndex];
                const clientData = this.clientMap[message[1]];
                if (clientData) {
                    //      console.log('GOT PEER REMOTE SYSTEM MESSAGE ON RELAY SERVER');
                    //]Protocol.PEER_REMOTE_SYSTEM_MESSAGE, toGottiId, fromPlayerIndex, type, data, toSystems, fromSystem ]);
                    this.channel.send([protocol, clientData.gottiId, message[6], message[2], message[3], message[4], message[5]], clientData.connectorId);
                }
            }
        });
    }

    private handlePlayerDisconnected(clientIndex) {
        //TODO keep track of connections and dispatch that signal was lost?
        delete this.clientMap[clientIndex];
    }

    private handlePeerFailedConnection(toPlayerIndex, fromPlayerIndex, options?) {
        const toPlayerData = this.clientMap[toPlayerIndex];
        if(toPlayerData) {
            this.channel.send([Protocol.SIGNAL_FAILED, fromPlayerIndex, toPlayerData.gottiId],  toPlayerData.connectorId)
        }
    }


    private handlePeerConnection(toPlayerIndex, fromPlayerSignalData, fromPlayerIndex, connectorId) {
        //   console.log('RelayServer SIGNAL_REQUEST > handlePeerConnection , toPlayerIndex was:', toPlayerIndex, 'fromPlayerSignalData:', fromPlayerSignalData, 'fromPlayerIndex: ', fromPlayerIndex, 'connectorId:', connectorId);

        const playersExistInMap = fromPlayerIndex in this.clientMap && toPlayerIndex in this.clientMap;

        let playersAreBothP2PEnabled = false;
        if (playersExistInMap) {
            playersAreBothP2PEnabled = this.clientMap[fromPlayerIndex].p2p && this.clientMap[toPlayerIndex].p2p
        }

        if (playersExistInMap && playersAreBothP2PEnabled) {
            let {connectorId, gottiId,} = this.clientMap[toPlayerIndex];
            const toPlayerData = {gottiId, connectorId};
            //     console.log('RelayServer handlePeerConnection sending signal success')
            this.channel.send([Protocol.SIGNAL_SUCCESS, fromPlayerIndex, fromPlayerSignalData, toPlayerData.gottiId], toPlayerData.connectorId)
        } else {
            this.channel.send([Protocol.SIGNAL_FAILED, fromPlayerIndex, toPlayerIndex], connectorId)
        }
    }

    private handlePeerConnectionRequest(toPlayerIndex, fromPlayerSignalData, systemName, requestOptions, fromPlayerIndex, connectorId) {
        const playersExistInMap = fromPlayerIndex in this.clientMap && toPlayerIndex in this.clientMap;

        let playersAreBothP2PEnabled = false;
        if (playersExistInMap) {
            playersAreBothP2PEnabled = this.clientMap[fromPlayerIndex].p2p && this.clientMap[toPlayerIndex].p2p
        }
        if (playersExistInMap && playersAreBothP2PEnabled) {
            let {connectorId, gottiId,} = this.clientMap[toPlayerIndex];
            const toPlayerData = {gottiId, connectorId};
            this.channel.send([Protocol.PEER_CONNECTION_REQUEST, fromPlayerIndex, fromPlayerSignalData, systemName, requestOptions,  toPlayerData.gottiId], toPlayerData.connectorId)
        } else {
            this.channel.send([Protocol.SIGNAL_FAILED, fromPlayerIndex, toPlayerIndex], connectorId)
        }
    }
}
"use strict";
// Relay Server serves 2 purposes
// 1. it acts as a signaling server for client p2p connections to communicate the signals between them even when on seperate connector servers
// 2. if a client wants to send a p2p message the relay server will act as a middleground and find which connector server a peer lives on the forward the message
Object.defineProperty(exports, "__esModule", { value: true });
const dist_1 = require("gotti-channels/dist");
const Protocol_1 = require("./Protocol");
class RelayServer {
    constructor(options) {
        this.masterChannel = null;
        this.channel = null;
        this.clientMap = {};
        this.p2pConnectionMap = {};
        this.currentConnections = [];
        this.masterChannel = new dist_1.BackMaster(Protocol_1.GOTTI_RELAY_SERVER_INDEX);
        this.masterChannel.initialize(options.relayURI, options.connectorURIs);
        this.masterChannel.addChannels([Protocol_1.GOTTI_RELAY_CHANNEL_ID]);
        this.channel = this.masterChannel.backChannels[Protocol_1.GOTTI_RELAY_CHANNEL_ID];
        this.registerBackChannelMessages();
    }
    registerBackChannelMessages() {
        this.channel.onMessage((message) => {
            const protocol = message[0];
            if (protocol === 100 /* CLIENT_WEB_RTC_ENABLED */) {
                console.log('RelayServer handling CLIENT_WEB_RTC_ENABLED, playerIndex was', message[1]);
                // [protocol,  playerIndex]
                if (this.clientMap[message[1]]) {
                    console.log('RelayServer handling CLIENT_WEB_RTC_ENABLED enabled p2p!');
                    this.clientMap[message[1]].p2p = true;
                }
                else {
                    throw new Error('ENABLED_CLIENT_P2P failed because player index was not in client map');
                }
            }
            else if (protocol === 111 /* SIGNAL_REQUEST */) {
                //    this.onMessage();
                // [protocol, toPlayerIndex, { sdp, connection  }, fromPlayerIndex, frontUid]
                this.handlePeerConnection(message[1], message[2], message[3], message[4]);
                //  this.onMessage(message[1]);
            }
            else if (protocol === 102 /* DISABLED_CLIENT_P2P */) {
                // [protocol, playerindex]
                const clientData = this.clientMap[message[1]];
                if (clientData) {
                    if (clientData.p2p) {
                        this.handleRemovePlayerConnections(message[1]);
                    }
                }
            }
            else if (protocol === 10 /* JOIN_CONNECTOR */) {
                console.log('RelayServer handling JOIN_CONNECTOR, playerIndex was', message[1], 'gottiId was', message[2], 'connectorId was', message[3]);
                this.clientMap[message[1]] = {
                    gottiId: message[2],
                    connectorId: message[3],
                };
            }
            else if (protocol === 12 /* LEAVE_CONNECTOR */) {
                const clientData = this.clientMap[message[1]];
                if (clientData) {
                    if (clientData.p2p) {
                        this.handleRemovePlayerConnections(message[1]);
                    }
                    delete this.clientMap[message[1]];
                }
            }
            else if (protocol === 109 /* PEER_REMOTE_SYSTEM_MESSAGE */) {
                //Protocol.PEER_REMOTE_SYSTEM_MESSAGE, peerIndex, message.type, message.data, message.to, message.from, playerIndex]);
                const clientData = this.clientMap[message[1]];
                if (clientData) {
                    console.log('GOT PEER REMOTE SYSTEM MESSAGE ON RELAY SERVER');
                    //Protocol.PEER_REMOTE_SYSTEM_MESSAGE, toGottiId, fromPlayerIndex message.type, message.data, message.to, message.from, playerIndex]);
                    this.channel.send([protocol, clientData.gottiId, message[6], message[2], message[3], message[4], message[5]], clientData.connectorId);
                }
            }
        });
    }
    handleRemovePlayerConnections(playerIndex) {
        /*
        if(this.playerIndexToConnections[playerIndex]) {
            this.playerIndexToConnections[playerIndex].forEach(connection => {
                connection.break();
            })
        }*/
        this.clientMap[playerIndex].p2p = false;
        let connections = this.p2pConnectionMap[playerIndex];
        let len = connections.length;
        while (len--) {
            connections[len].splice(connections[len].indexOf(playerIndex), 1);
        }
    }
    handlePeerConnection(toPlayerIndex, fromPlayerSignalData, fromPlayerIndex, connectorId) {
        console.log('RelayServer SIGNAL_REQUEST > handlePeerConnection , toPlayerIndex was:', toPlayerIndex, 'fromPlayerSignalData:', fromPlayerSignalData, 'fromPlayerIndex: ', fromPlayerIndex, 'connectorId:', connectorId);
        const playersExistInMap = fromPlayerIndex in this.clientMap && toPlayerIndex in this.clientMap;
        let playersAreBothP2PEnabled = false;
        if (playersExistInMap) {
            playersAreBothP2PEnabled = this.clientMap[fromPlayerIndex].p2p && this.clientMap[toPlayerIndex].p2p;
        }
        if (playersExistInMap && playersAreBothP2PEnabled) {
            let { connectorId, gottiId, } = this.clientMap[toPlayerIndex];
            const toPlayerData = { gottiId, connectorId };
            if (!(this.p2pConnectionMap[toPlayerIndex].includes(fromPlayerIndex))) {
                this.p2pConnectionMap[toPlayerIndex].push(fromPlayerIndex);
            }
            if (!(this.p2pConnectionMap[fromPlayerIndex].includes(toPlayerIndex))) {
                this.p2pConnectionMap[fromPlayerIndex].push(toPlayerIndex);
            }
            console.log('RelayServer handlePeerConnection sending signal success');
            this.channel.send([112 /* SIGNAL_SUCCESS */, fromPlayerIndex, fromPlayerSignalData, toPlayerData.gottiId], toPlayerData.connectorId);
        }
        else {
            this.channel.send([113 /* SIGNAL_FAILED */, fromPlayerIndex, toPlayerIndex], connectorId);
        }
    }
}
exports.RelayServer = RelayServer;

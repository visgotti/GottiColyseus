/***************************************************************************************
 *  Modified implementation of the original Room class in colyseus, most of the code
 *  is copied directly from the version of colyseus the project was started with to prevent
 *  breaking changes that would come from extending or implementing it directly.
 *
 *  Original code was written by-
 *  https://github.com/colyseus and https://github.com/endel
 *
 *  modified to fit GottiColyseus by -
 *  https://github.com/visgotti
 ***************************************************************************************/
import Timeout = NodeJS.Timeout;

const msgpack = require('notepack.io');

import * as net from 'net';
import * as http from 'http';
import {generateId, parseQueryString, spliceOne} from './Util';

import * as parseURL from 'url-parse';

import * as WebSocket from 'ws';
import {ServerOptions as IServerOptions} from 'ws';

import {Messenger as Responder} from 'gotti-reqres/dist';

import {Client as ChannelClient, FrontChannel, FrontMaster} from 'gotti-channels/dist';
import {
    decode,
    GateProtocol,
    GOTTI_MASTER_CHANNEL_ID,
    GOTTI_RELAY_CHANNEL_ID,
    Protocol,
    ReservedSeatType,
    send,
    WS_CLOSE_CONSENTED,
} from './Protocol';
import {PeerConnection, RtcConfig} from 'node-datachannel'

import {EventEmitter} from 'events';

import {ConnectorClient as Client} from './ConnectorClient';
import {setInterval} from "timers";
import {IConnectorClient} from "./ConnectorClients/IConnectorClient";
import {SdpSignal, WebRTCConnectorClient} from "./ConnectorClients/WebRTC";
import {WebSocketConnectorClient} from "./ConnectorClients/WebSocket"
import set = Reflect.set;
import * as assert from "assert";

const nodeDataChannel = require('node-datachannel');

const nanoid = require('nanoid');


//import { debugAndPrintError, debugPatch, debugPatchData } from '../../colyseus/lib/Debug';

const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)
const DEFAULT_SIMULATION_INTERVAL = 1000 / 60; // 60fps (16.66ms)

const DEFAULT_SEAT_RESERVATION_TIME = 3;

const DEFAULT_RELAY_RATE = 1000 / 30; // 30fpS

export type SimulationCallback = (deltaTime?: number) => void;

export type ServerURI = {
    private?: string,
    public: string,
}

export type ConnectorOptions = IServerOptions & {
    pingTimeout?: number,
    forceWebRTCClients?: number,
    disableWebRTCClients?: number,
    maxWebRTCConnections?: number,
    gracefullyShutdown?: boolean,
    server: string,
    port?: number,
    webRtcPort?: number,
    messageRelayRate?: number,
    serverIndex: number,
    connectorURI: ServerURI,
    gameData?: any,
    gateURI: ServerURI,
    masterServerURI?: ServerURI,
    areaRoomIds: Array<string>,
    areaServerURIs: Array<ServerURI>,
    relayURI?: ServerURI,
};

export interface RoomAvailable {
    clients: number;
    maxClients: number;
    metadata?: any;
}

export interface BroadcastOptions {
    except: Client;
}

export abstract class Connector extends EventEmitter {
    protected httpServer: any;
    private relayChannel?: FrontChannel;
    private masterServerChannel?: FrontChannel;
    private webRTCConnections : Array<WebRTCConnectorClient> = [];
    private peerConnections: {[id: string]: { peer: PeerConnection, server: PeerConnection }};

    private awaitingWebRTCConnections : {[id: string]: WebRTCConnectorClient } = {}

    public areaData: {[areaId: string]: any};
    public gameData: any = {};

    public options: ConnectorOptions;
    private iceServers: Array<string>;

    public serverIndex: number;
    public connectorURI: ServerURI;
    public areaRoomIds: Array<string>;
    public areaServerURIs: Array<ServerURI>;
    public port: number;

    public roomName: string;
    public maxClients: number = Infinity;
    public patchRate: number = DEFAULT_PATCH_RATE;
    public autoDispose: boolean = true;
    public state: any;
    public metadata: any = null;
    public currentWebRTCConnections : number = 0;
    public masterChannel: FrontMaster = null;
    public privateMasterChannel : FrontMaster = null;
    public channels: any;

    private ackInterval?: Timeout = null;

    public clients: IConnectorClient[] = [];
    public clientsById: {[gottiId: string]: IConnectorClient} = {};
    private webRTCConfig : RtcConfig;
    private _patchInterval: NodeJS.Timer;
    private _relayMessageTimeout: NodeJS.Timer;
    private maxWebRTCConnections : number = -1;
    private websocketServer: any;
    private gateURI: ServerURI;
    private masterServerURI: ServerURI;
    private relayURI: ServerURI;

    private nextAckClientIndex : number;
    private ackIntervalRate : number = 25;

    private responder: Responder;
    private serverWebRtcConnection;

    private reservedSeats: {
        [clientId: string]: {
            auth: any,
            playerIndex: number,
            joinOptions: any,
            channelClient?: ChannelClient,
            seatType: ReservedSeatType,
            timeout: any,
        }
    } = {};


    private messageRelayRate: number; // 20 fps
    constructor(options: ConnectorOptions) {
        super();
        this.masterServerURI = options.masterServerURI;
        this.gateURI = options.gateURI;
        this.messageRelayRate = options.messageRelayRate || DEFAULT_RELAY_RATE;
        this.areaRoomIds = options.areaRoomIds;
        this.connectorURI = options.connectorURI;
        this.relayURI = options.relayURI;
        this.areaServerURIs = options.areaServerURIs;
        this.serverIndex = options.serverIndex;
        this.port = options.port | 8080;
        this.options = options;
        this.options.port = this.port;

        if(options.disableWebRTCClients) {
            this.maxWebRTCConnections = 0;
        } else {
            this.maxWebRTCConnections = 'maxWebRTCConnections' in options ? options.maxWebRTCConnections : -1;
        }

        if(this.options.gameData) {
            this.gameData = this.options.gameData
        }
        if(options.server === 'http') {
            this.httpServer = http.createServer();
            this.options.server = this.httpServer;
        } else if(options.server === 'net') {
        } else {
            throw 'please use http or net as server option'
        }

        this.webRTCConfig = {
            iceServers: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ],
            portRangeBegin: 7100,
            portRangeEnd: 7500
        }

        this.createResponder(options.gateURI.public);
        this.registerGateResponders();
        //this.setPatchRate(this.patchRate);
    }


    private createResponder(gateURI) {
        this.responder = new Responder({
            response: true,
            id: `${this.serverIndex}_responder`,
            brokerURI: gateURI,
        });
    }

    protected setMessageRelayRate(rate: number) {
        this.messageRelayRate = rate;
    }

    protected startMessageRelay() {
        this.relayMessages();
    }

    protected stopMessageRelay() {
        clearTimeout(this._relayMessageTimeout);
    }

    private relayMessages() {
        this._relayMessageTimeout = setTimeout(() => {
            this.masterChannel.sendQueuedMessages();
            this.relayMessages();
        }, this.messageRelayRate)
    }

    protected onWebSocketConnection (client: WebSocket, req: http.IncomingMessage & any) {
        client.pingCount = 0;
        const upgradeReq = req || client.upgradeReq;
        const url = parseURL(upgradeReq.url);
        const query = parseQueryString(url.query);
        req.gottiId = query.gottiId;
        const gottiId = query.gottiId;
        client.state = 'open';
        if(!(client) || !(gottiId) || !(this.reservedSeats[req.gottiId]) ) {
            send(client, Protocol.JOIN_CONNECTOR_ERROR, [Protocol.JOIN_CONNECTOR_ERROR])
        } else {
            const gottiId = req.gottiId;
            const { auth, joinOptions, playerIndex, seatType } = this.reservedSeats[gottiId];
            let wasRejoin = false;
            let gottiClient : WebSocketConnectorClient;
            const oldClient = this.clientsById[gottiId];
            if(seatType === ReservedSeatType.DIRTY_WEB_RTC_DISCONNECT) {
                gottiClient = new WebSocketConnectorClient(client, oldClient.channelClient);
                if(!oldClient) throw new Error(`No old client when player disconnected.`);
                this.transferClientData(oldClient, gottiClient);
                wasRejoin = true;
            } else if(oldClient) {
                throw new Error(`Should not already have a client`)
            } else {
                gottiClient = new WebSocketConnectorClient(client, new ChannelClient(req.gottiId, this.masterChannel));
            }
            gottiClient.gottiId = gottiId;
            gottiClient.p2p_capable = query.isWebRTCSupported;
            gottiClient.playerIndex = playerIndex;
            gottiClient.state = 'open';
            gottiClient.pingCount = 0;
            console.log('got rejoin as', wasRejoin, auth)
            this._onJoin(gottiClient, auth, joinOptions, wasRejoin);
        }

        // prevent server crashes if a single client had unexpected error
        client.on('error', (err) => console.error(err.message + '\n' + err.stack));
        //send(client, [Protocol.USER_ID, client.gottiId])
    };

    private extractURI(uri: ServerURI) : string {
        const hasPrivate = !!this.connectorURI.private;
        if(hasPrivate && uri.private) {
            return uri.private
        }
        return uri.public;
    }

    public async connectToAreas() : Promise<boolean> {
        this.masterChannel = new FrontMaster(this.serverIndex);
        const hasPrivateURI = !!this.connectorURI.private;

        let backChannelURIs = [...this.areaServerURIs.map(uri => {
            return this.extractURI(uri);
        })];
        let backChannelIds = [...this.areaRoomIds];
        if(this.masterServerURI) {
            backChannelURIs.push(this.extractURI(this.masterServerURI));
            backChannelIds.push(GOTTI_MASTER_CHANNEL_ID);
        }
        if(this.relayURI) {
            backChannelURIs.push(this.extractURI(this.relayURI));
            backChannelIds.push(GOTTI_RELAY_CHANNEL_ID);
        }

        this.masterChannel.initialize(this.connectorURI.public, backChannelURIs);
        if(hasPrivateURI) {
            this.privateMasterChannel = new FrontMaster(-this.serverIndex);
        }
        this.masterChannel.addChannels(backChannelIds);

        this.channels = this.masterChannel.frontChannels;
        if(this.relayURI) {
            this.relayChannel = this.channels[GOTTI_RELAY_CHANNEL_ID];
        }
        if(this.channels[GOTTI_MASTER_CHANNEL_ID]) {
            this.masterServerChannel = this.channels[GOTTI_MASTER_CHANNEL_ID];
        }

        //TODO: right now you need to wait a bit after connecting and binding to uris will refactor channels eventually to fix this
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.masterChannel.connect().then((connection) => {
                    this.areaData = connection ? connection.backChannelOptions : {};
                    // connection backChannelOptions were made with area channels in mind.. so
                    // these frameworked channels keys should be deleted if theyre in.
                    delete this.areaData[GOTTI_RELAY_CHANNEL_ID];
                    delete this.areaData[GOTTI_MASTER_CHANNEL_ID];

                    this.registerChannelMessages();
                    this.websocketServer = new WebSocket.Server(this.options);
                    this.websocketServer.on('connection', this.onWebSocketConnection.bind(this));
                    this.on('connection', this.onWebSocketConnection.bind(this)); // used for testing
                    this.startMessageRelay();
                    return resolve(true);
                });
            }, 500);
        });
    }

    // Abstract methods
    public abstract onMessage(client: Client, message: any): void;

    // Optional abstract methods
    public onInit?(options: any): void;

    // triggered when sending message from gate using gate.sendConnector();
    public onMasterMessage?(message: any) : void;

    // hook that gets ran when a client successfully joins the reserved seat.
    public onJoin?(client: Client, setArea): any | Promise<any>;
    public onLeave?(client: Client, consented?: boolean): void | Promise<any>;
    public onDispose?(): void | Promise<any>;

    /**
     * @param auth - authentication data sent from Gate server.
     * @param joinOptions - additional options that may have sent from gate server, you can add/remove properties
     * to it in request join and it will persist onto the client object.
     * @returns {number}
     */
    public requestJoin(auth: any, joinOptions: any): number | boolean {
        return 1;
    }

    public getClientDataByGottiId(gottiId) {
        const client = this.clientsById[gottiId];
        if(client) {
            return {
                auth: client.auth,
                joinOptions: client.joinOptions,
            }
        }
        return null;
    }

    public async close() {
        return this.disconnect(true);
    }

    public async disconnect(closeHttp: boolean=true) : Promise<boolean> {
        this.stopMessageRelay();
        this.autoDispose = true;
        let i = this.clients.length;
        while (i--) {
            const client = this.clients[i];
            client.state === 'open' && client.close(WS_CLOSE_CONSENTED);
        }
        try {this.masterChannel && this.masterChannel.disconnect();
        } catch(err){};
        try{this.websocketServer.close();
        }catch(err){};
        try{this.responder.close();
        }catch(err){};
        if(this.maxWebRTCConnections !== 0) {
            nodeDataChannel.cleanup();
        }
        return new Promise((resolve, reject) => {
            if(closeHttp) {
                this.httpServer.close(() => {
                    resolve(true);
                });
            } else {
                resolve(true);
            }
        });
    }

    /**
     * When a client succesfully joins a connector they need to make an initial area request
     *  with options and whatever area id this connector value returns will be the first area
     *  the player listens and writes to. from there use the ClientManager setClientWrite/addClientListen/ and removeClientListener
     *  to change a players areas.
     * @param client
     * @param areaData - options set on area before the game to help connector figure out which area to return
     * @param clientOptions - options sent from the client when starting the game.
     * @returns { areaId: string, options: any } - areaId the client is going to write to and any additional options to send.
     */
    public abstract getInitialWriteArea(client: IConnectorClient, areaData, clientOptions?) : { areaId: string, options: any }

    protected broadcast(data: any, options?: BroadcastOptions, reliable=false, ordered=false): boolean {
        // no data given, try to broadcast patched state
        if (!data) {
            throw new Error('Room#broadcast: \'data\' is required to broadcast.');
        }
        let protocol = 1;
        if(reliable) {
            protocol+=5;
        }
        if(ordered) {
            protocol+=12;
        }
        let numClients = this.clients.length;
        while (numClients--) {
            const client = this.clients[ numClients ];
            if ((!options || options.except !== client)) {
                send(client, protocol, data, false);
            }
        }

        return true;
    }

    private registerClientAreaMessageHandling(client) {
        client.channelClient.onMessage((message) => {
            const protocol = message[0];
            if(
                protocol === Protocol.SYSTEM_MESSAGE ||
                protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE ||
                Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES ||
                protocol === Protocol.SYSTEM_MESSAGE_RELIABLE_ORDERED ||
                protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE_RELIABLE_ORDERED ||
                Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED ||
                protocol === Protocol.SYSTEM_MESSAGE_RELIABLE ||
                protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE_RELIABLE ||
                Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE
            ) {
                send(client, protocol, message);
            } else if (protocol === Protocol.ADD_CLIENT_AREA_LISTEN) {
                // message[1] areaId,
                // message[2] options
                this.addAreaListen(client, message[1], message[2]);
            }
            else if (protocol === Protocol.REMOVE_CLIENT_AREA_LISTEN) {
                this.removeAreaListen(client, message[1], message[2]);
            }
            else if(protocol === Protocol.SET_CLIENT_AREA_WRITE) {
                // the removeOldWriteListener will be false since that should be explicitly sent from the old area itself.
                this.changeAreaWrite(client, message[1], message[2]);
            } else {
                throw new Error('Unhandled client message protocol'+ message[0]);
            }
        });
    }
    private async initiateWebRtcConnection(client: WebSocketConnectorClient) : Promise<WebRTCConnectorClient> {
        const webRTCClient = new WebRTCConnectorClient(client.gottiId, this.webRTCConfig);
        let fulfilled = false;
        this.awaitingWebRTCConnections[client.gottiId] = webRTCClient;
        this.currentWebRTCConnections++;
        webRTCClient.on('added-signal', (signal) => {
            const stillCollecting = this.clientsById[client.gottiId] === client;
            stillCollecting && send(client, Protocol.SERVER_WEBRTC_CANDIDATE,[Protocol.SERVER_WEBRTC_CANDIDATE, signal])
        });
        webRTCClient.once('opened-channel', () => {
            this.handleFinishSuccesfulWebSocketToWebRTCClient(client, webRTCClient);
        });
        return new Promise((resolve, reject) => {
            webRTCClient.on('failed-to-connect', (reason: string) => {
                if(fulfilled) return;
                fulfilled = true;
                this.currentWebRTCConnections--;
                return resolve(null);
            });
            webRTCClient.once('initial-sdp', (sdp : SdpSignal) => {
                if(fulfilled) return;
                fulfilled = true;
                const stillCollecting = this.clientsById[client.gottiId] === client;
                if(!stillCollecting) {
                    return resolve(null);
                } else {
                    send(client, Protocol.INITIATE_CHANGE_TO_WEBRTC, [Protocol.INITIATE_CHANGE_TO_WEBRTC, sdp.sdp]);
                    return resolve(webRTCClient);
                }
            });
        });
    }

    // iterates through all the channels the connector
    // is listening to, and registers needed messages based
    // on which type of channel it is.
    private registerChannelMessages() {
        const keys = Object.keys(this.channels);
        for(let i = 0; i < keys.length; i++) {
            const channelId = keys[i];
            const channel = this.channels[channelId];

            let registerHandler = this.registerAreaMessages.bind(this);

            // change register handler if the channel id was a specified gotti frameworked channel id
            if(channelId === GOTTI_MASTER_CHANNEL_ID) {
                registerHandler = this.registerMasterServerMessages.bind(this);
            } else if(channelId === GOTTI_RELAY_CHANNEL_ID) {
                registerHandler = this.registerRelayMessages.bind(this);
            }

            registerHandler(channel);
        }
    }

    private registerMasterServerMessages() {
        if(this.masterServerChannel) {
            this.masterServerChannel.onMessage((message) => {
                if(message[0] === Protocol.MASTER_TO_AREA_BROADCAST){
                    //TODO: the only way to broadcast to all area rooms right now is through an area front channel since the masterServerChannel doesnt know about the areas
                    // we should probably try and keep the area front channels sorted by clients in them so we can use most optimized one to make the dispatches
                    this.channels[this.areaRoomIds[0]].broadcast(message, this.areaRoomIds);
                } else {
                    this.onMasterMessage && this.onMasterMessage(message);
                }
            });
        }
    }

    private registerRelayMessages(relayChannel: FrontChannel) {
        if(!relayChannel || relayChannel !== this.relayChannel) {
            throw new Error('Connector.registerRelayMessages did not receive a valid relayChannel')
        }
        relayChannel.onMessage((message) => {
            const protocol = message[0];
            if(protocol === Protocol.ENABLED_CLIENT_P2P_SUCCESS) {
           //     console.log('Connector.registerRelayMessages ENABLED_CLIENT_P2P_SUCCESS for player', message[1]);
                const client = this.clientsById[message[1]];
                if(client) {
                    client.p2p_enabled = true;
                    send(this.clientsById[message[1]], Protocol.ENABLED_CLIENT_P2P_SUCCESS, [Protocol.ENABLED_CLIENT_P2P_SUCCESS]);
                }
            } else if(protocol === Protocol.SIGNAL_SUCCESS) {
                //[Protocol.SIGNAL_SUCCESS, fromPlayerIndex,  fromPlayerSignalData, toPlayerrGottiId], toPlayerData.connectorId)
                const toClient = this.clientsById[message[3]];
                // sends the sdp and ice to other client of client
                if(toClient) {
                    // [protocol, fromPlayerIndex, fromPlayerSignalData, from system name, request options]
                    send(toClient, protocol, [protocol, message[1], message[2]]);
                }
            } else if (protocol === Protocol.SIGNAL_FAILED) {
                // [protocol, fromPlayerIndex, toPlayerGottiId, options])
                const toClient = this.clientsById[message[2]];
                if(toClient) {
                    // [protocol, fromPlayerIndex, options?]
                    send(toClient, protocol,[protocol, message[1], message[2]]);
                }
            }
            else if(protocol === Protocol.PEER_CONNECTION_REQUEST) {
                //[Protocol.SIGNAL_SUCCESS, fromPlayerIndex,  fromPlayerSignalData, systemName, requestOptions, toPlayerrGottiId], toPlayerData.connectorId)
                const toClient = this.clientsById[message[5]];
                if(toClient) {
                    // [protocol, fromPlayerIndex, fromPlayerSignalData, from system name, request options]
                    send(toClient, protocol, [protocol, message[1], message[2], message[3], message[4]])
                }
            } if(protocol === Protocol.PEER_REMOTE_SYSTEM_MESSAGE) {
                //Protocol.PEER_REMOTE_SYSTEM_MESSAGE, toGottiId, fromPlayerIndex, message.type, message.data, message.to]);
                const toClient = this.clientsById[message[1]];
                if(toClient) {
                    send(toClient, protocol, [protocol, message[2], message[3], message[4], message[5]])
                }
            }
        });
    }

    private registerAreaMessages(areaChannel: FrontChannel) {
        areaChannel.onMessage((message) => {
            const protocol = message[0];
            if(
                protocol === Protocol.SYSTEM_MESSAGE ||
                protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE ||
                protocol === Protocol.SYSTEM_MESSAGE_RELIABLE_ORDERED ||
                protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE_RELIABLE_ORDERED ||
                protocol === Protocol.SYSTEM_MESSAGE_RELIABLE ||
                protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE_RELIABLE
            ) {
                // add from area id
                // get all listening clients for area/channel
                const listeningClientUids = areaChannel.listeningClientUids;
                let numClients = listeningClientUids.length;
                // iterate through all and relay message
                if(protocol < 6) {
                    message = msgpack.encode(message);
                    while (numClients--) {
                        const client = this.clientsById[listeningClientUids[numClients]];
                        send(client, protocol, message, false);
                    }
                } else {
                    while (numClients--) {
                        const client = this.clientsById[listeningClientUids[numClients]];
                        send(client, protocol, message);
                    }
                }
            } else if (
                protocol === Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE ||
                protocol === Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES ||
                protocol === Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED
            ) {
                const clientIds = message.slice(2);
                for(let i = 0; i < clientIds.length; i++) {
                    const client = this.clientsById[ clientIds[i]];
                    client && send(client, protocol, message[1], false);
                }
            } else if (message[0] === Protocol.AREA_TO_AREA_SYSTEM_MESSAGE) {
                // [protocol, type, data, to, from, areaIds]
                const toAreaIds = message[5];
                // reassign last value in array to the from area id
                message[5] = areaChannel.channelId;
                areaChannel.broadcast(message, toAreaIds)
            } else if(message[0] === Protocol.AREA_TO_MASTER_MESSAGE) {
                this.masterServerChannel.send([Protocol.AREA_TO_MASTER_MESSAGE, areaChannel.channelId, message[1]])
            }
        });
    }


    private async _getInitialWriteArea(client, clientOptions?: any) : Promise<boolean> {
        const oldAreaId = client.channelClient.processorChannel;
        if(oldAreaId) {
            send(client, Protocol.WRITE_AREA_ERROR, Protocol.WRITE_AREA_ERROR);
            return false;
        }
        const write = this.getInitialWriteArea(client, this.areaData, clientOptions);
        if(write) {
            // will dispatch area messages to systems
            await this.changeAreaWrite(client, write.areaId, write.options);
            return true;
        } else {
            send(client, Protocol.WRITE_AREA_ERROR, Protocol.WRITE_AREA_ERROR);
            return false;
        }
    }


    private transferClientData(oldClient:IConnectorClient, newClient: IConnectorClient) {
        newClient.channelClient = oldClient.channelClient;
        newClient.gottiId = oldClient.gottiId;
        newClient.playerIndex = oldClient.playerIndex;
        newClient.state = oldClient.state;
        newClient.id = oldClient.id;
        newClient.joinOptions = oldClient.joinOptions;
        newClient.auth = oldClient.auth;
        newClient.pingCount = oldClient.pingCount;
        newClient.p2p_capable = oldClient.p2p_capable;
        newClient.p2p_enabled = oldClient.p2p_enabled;
    }

    private handleCleanWebRTCDisconnect(client: WebRTCConnectorClient) {
        this.removeWebRTCClientRef(client);
        this._onLeave(client)
    }

    private removeWebRTCClientRef(client) : boolean {
        const idx = this.webRTCConnections.indexOf(client);
        console.log('index', idx);
        if(idx < 0) return false;
        this.webRTCConnections.splice(idx);
        this.currentWebRTCConnections--;
        if(!this.currentWebRTCConnections) {
            this.stopAckInterval();
            if(this.webRTCConnections.length) throw new Error(`Length should be 0.`)
        }
        return true;
    }

    private handleDirtyWebRTCDisconnect(client: WebRTCConnectorClient) {
        if(!this.removeWebRTCClientRef(client)) throw new Error(`Expected to remove.`)
        this._reserveSeat(client.gottiId, client.playerIndex, client.auth, client.joinOptions, ReservedSeatType.DIRTY_WEB_RTC_DISCONNECT, 5000, () => {
            this.handleCleanWebRTCDisconnect(client);
        });
    }

    private handleFinishSuccesfulWebSocketToWebRTCClient(webSocketClient: WebSocketConnectorClient, webRtcClient: WebRTCConnectorClient) : WebRTCConnectorClient {
        const index = this.clients.indexOf(webSocketClient);
        if(index < 0 || this.awaitingWebRTCConnections[webSocketClient.gottiId] !== webRtcClient) {
            throw new Error(`Websocket client was not found.`)
        }
        webSocketClient.closingForWebRTC = true;
        delete this.awaitingWebRTCConnections[webSocketClient.gottiId];
        // todo: gracefully disconnect the websocket.
        this.clients[index] = webRtcClient;
        this.clientsById[webSocketClient.gottiId] = webRtcClient;
        this.webRTCConnections.push(webRtcClient);
        this.transferClientData(webSocketClient, webRtcClient);
        webSocketClient.removeAllListeners();
        webSocketClient.close();
        webRtcClient.on('message', this._onWebClientMessage.bind(this, webRtcClient));
        webRtcClient.removeAllListeners('opened-channel');
        webRtcClient.removeAllListeners('added-candidate');

        webRtcClient.once('closed-channel', (reason: string) => {
            console.log('closed reason:', reason)
            this.handleDirtyWebRTCDisconnect(webRtcClient);
        });
        this.emit('webrtc-connection',  webRtcClient)
        if(!this.ackInterval) {
            this.startAckInterval();
        }
        return webRtcClient;
    }
    private startAckInterval() {
        this.nextAckClientIndex = 0;
        this.ackInterval = setInterval(() => {
            this.ackNextRoundRobin();
        }, this.ackIntervalRate);
    }
    private stopAckInterval() {
        if(this.ackInterval) {
            clearInterval(this.ackInterval)
        }
        this.ackInterval = null;
    }

    private ackNextRoundRobin() : WebRTCConnectorClient {
        let checked = 0;
        if(this.nextAckClientIndex >= this.webRTCConnections.length) {
            this.nextAckClientIndex = 0;
        }
        const totalLen = this.webRTCConnections.length;
        let minSend = Math.min(Math.floor(totalLen/10), 1);
        let sent = 0;
        while(checked < totalLen && sent < minSend) {
            const client = this.webRTCConnections[this.nextAckClientIndex++];
            if(client.sendAcks()) {
                return client;
            } else {
                if(this.nextAckClientIndex === this.webRTCConnections.length) {
                    this.nextAckClientIndex = 0;
                }
                checked++;
            }
        }
        return null;
    }

    private _onWebClientMessage(client: IConnectorClient, decoded: Array<any>) {
        const protocol = decoded[0];
        if (protocol === Protocol.SYSTEM_MESSAGE) {
            //TODO go into my channel lib and make it so you can send encoding as false so we can just forward the encoded message
            client.channelClient.sendLocal(decoded);
        } else if(protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE) {
            client.channelClient.sendLocalImmediate(decoded);
        } else if(protocol === Protocol.GET_INITIAL_CLIENT_AREA_WRITE) {
            this._getInitialWriteArea(client, decoded[1])
        } else if(protocol === Protocol.PEER_REMOTE_SYSTEM_MESSAGE){
         //   console.log('Connector _onWebClientMessage handlng PEER_REMOTE_SYSTEM_MESSAGE for peer', decoded[1], 'from player:', client.gottiId);
            //[Protocol.PEER_REMOTE_SYSTEM_MESSAGE, peerIndex, message.type, message.data, message.to, playerIndex]);
            this.relayChannel && this.relayChannel.send([...decoded, client.playerIndex])
        } else if(protocol === Protocol.PEERS_REMOTE_SYSTEM_MESSAGE) {
        } else if (protocol === Protocol.LEAVE_CONNECTOR) {
            // stop interpreting messages from this client
            client.removeAllListeners('message');
            // prevent "onLeave" from being called twice in case the connection is forcibly closed
            client.removeAllListeners('close');
            // only effectively close connection when "onLeave" is fulfilled
            this._onLeave(client, WS_CLOSE_CONSENTED).then(() => client.close());
        } else if(protocol === Protocol.CLIENT_WEB_RTC_ENABLED) {
            if(this.relayChannel) {
                // [sdp, ice]
                this.relayChannel.send([Protocol.CLIENT_WEB_RTC_ENABLED, client.playerIndex])
            }
        } else if(protocol === Protocol.DISABLED_CLIENT_P2P) {
                // [sdp, ice]
            this.relayChannel && this.relayChannel.send([Protocol.DISABLED_CLIENT_P2P, client.playerIndex]);
        } else if(protocol === Protocol.SIGNAL_REQUEST) {
                // [protocol, toPlayerIndex, { sdp, candidate }
            const toPlayerIndex = decoded[1];
            // server signal request
            if(toPlayerIndex === -1) {
                const awaitingWebRTC = this.awaitingWebRTCConnections[client.gottiId];
                awaitingWebRTC && awaitingWebRTC.receivedRemoteSignal(decoded[2])
            } else {
                this.relayChannel && this.relayChannel.send([protocol, toPlayerIndex, decoded[2], client.playerIndex, this.relayChannel.frontUid]);
            }
        } else if(protocol === Protocol.PEER_CONNECTION_REQUEST) {
            // protocol, toPlayerIndex, { sdp, candidate }, systemName, options
            this.relayChannel && this.relayChannel.send([protocol, decoded[1], decoded[2], decoded[3], decoded[4], client.playerIndex, this.relayChannel.frontUid]);
        } else if(protocol === Protocol.SIGNAL_FAILED) {
            this.relayChannel && this.relayChannel.send([protocol, decoded[1], client.playerIndex]);
        }
    }

    private async addAreaListen(client, areaId, options?) : Promise<boolean> {
        try {
            const linkedResponse = await client.channelClient.linkChannel(areaId, options);

            /* adds newest state from listened area to the clients queued state updates as a 'SET' update
             sendState method forwards then empties that queue, any future state updates from that area
             will be added to the client's queue as 'PATCH' updates. */
           // this.sendState(client);

            send(client, Protocol.ADD_CLIENT_AREA_LISTEN, [Protocol.ADD_CLIENT_AREA_LISTEN, areaId, linkedResponse]);

            return true;
        } catch(err) {
            //   console.log('error was', err);
            return false;
        }
    }

    /**
     *
     * @param client
     * @param newAreaId - new area id that will become the writer
     * @param writeOptions - options that get sent with the new write client notification to the new area
     * @returns {boolean}
     */
    private async changeAreaWrite(client, newAreaId, writeOptions) : Promise<boolean> {
        let isLinked = client.channelClient.isLinkedToChannel(newAreaId);
        if(!(isLinked)) {
            isLinked = await this.addAreaListen(client, newAreaId, writeOptions);
        }

        if(isLinked) {
            const success = client.channelClient.setProcessorChannel(newAreaId, false, writeOptions);
            if(success) {
                send(client, Protocol.SET_CLIENT_AREA_WRITE, [Protocol.SET_CLIENT_AREA_WRITE, newAreaId, writeOptions]);
                return true;
            }
        }
        return false;
    }

    private removeAreaListen(client, areaId, options) {
        if(!(this.masterChannel.frontChannels[areaId]))  { console.error('invalid areaId') }

        client.channelClient.unlinkChannel(areaId);
        send(client, Protocol.REMOVE_CLIENT_AREA_LISTEN, [Protocol.REMOVE_CLIENT_AREA_LISTEN, areaId, options] );
    }

    private _onJoin(client: WebSocketConnectorClient, auth: any, joinOptions: any, wasRejoin=false) {
        // clear the timeout and remove the reserved seat since player joined
        clearTimeout(this.reservedSeats[client.gottiId].timeout);
        console.log('removing the client id', client.gottiId, 'from reserved seats')
        delete this.reservedSeats[client.gottiId];
        // add a channelClient to client
        // register channel/area message handlers
        if(!wasRejoin) {
            this.registerClientAreaMessageHandling(client);
            this.clientsById[client.gottiId] = client;
            this.clients.push( client );
            client.auth = auth;
            client.joinOptions = joinOptions;
            if(this.onJoin) {
                client.joinedOptions = this.onJoin(client, this.changeAreaWrite.bind(this, client))
            }
            client.auth = auth;
            if(this.relayChannel) { // notify the relay server of client with connector for failed p2p system messages to go through
                this.relayChannel.send([Protocol.JOIN_CONNECTOR, client.p2p_capable, client.playerIndex, client.gottiId, this.relayChannel.frontUid])
            }
        } else {
            const oldClient = this.clientsById[client.gottiId];
            const idx = this.clients.indexOf(oldClient);
            assert(idx > -1);
            this.clients[idx] = client;
        }

        this.clientsById[client.gottiId] = client;

        send(client, Protocol.JOIN_CONNECTOR,[ Protocol.JOIN_CONNECTOR, client.joinedOptions ]);
        client.on('message', (message) => {
            let decoded = decode(message);
            if (!decoded) {
                //    debugAndPrintError(`${this.roomName} (${this.roomId}), couldn't decode message: ${message}`);
                return;
            }
            this._onWebClientMessage(client, decoded);
        });
        client.once('close', this._onLeave.bind(this, client));
        if(client.p2p_capable && (this.maxWebRTCConnections === -1 || this.currentWebRTCConnections < this.maxWebRTCConnections)) {
            this.initiateWebRtcConnection(client);
        }
    }

    private async _onLeave(client: IConnectorClient, code?: number): Promise<any> {
        if(client['closingForWebRTC']) return;
        // call abstract 'onLeave' method only if the client has been successfully accepted.
        if(this.relayChannel) {
            this.relayChannel.send([Protocol.LEAVE_CONNECTOR, client.playerIndex]);
        }

        if (spliceOne(this.clients, this.clients.indexOf(client))) {
            delete this.clientsById[client.gottiId];
            // disconnect gotti client too.
            client.channelClient.unlinkChannel();
            //TODO: notify gate server

            // If user defined onLeave, run it.
            this.onLeave && this.onLeave(client, (code === WS_CLOSE_CONSENTED));
        }

        this.emit('leave', client);
    }

    /**
     * reserves seat till player joins
     * @param clientId - id of player to reserve seat for
     * @param auth - data player authenticated with on gate.
     * @param joinOptions - additional data sent from the gate
     * @private
     */
    private _reserveSeat(clientId, playerIndex, auth, joinOptions, type: ReservedSeatType, timeout=10000, onTimeout?: () => void) {
        this.reservedSeats[clientId] = {
            auth,
            playerIndex,
            joinOptions,
            seatType: type,
            timeout: setTimeout(() => {
                delete this.reservedSeats[clientId];
                onTimeout && onTimeout();
            }, timeout) // reserve seat for 10 seconds
        }
    }

    /**
     * Handles request from gate server, whatever this returns gets sent back to the gate server
     * to notify it if the reserve seat request went through or not.
     * @param data - data sent from gate server after play authenticated
     * @private
     */
    private _requestJoin(data) {
        const playerIndex= data.playerIndex;
        const auth = data && data.auth ? data.auth : {};
        const joinOptions = data && data.joinOptions ? data.joinOptions : {};

        if(this.requestJoin(auth, joinOptions)) {
            const gottiId = generateId();
            this._reserveSeat(gottiId, playerIndex, auth, joinOptions, ReservedSeatType.GATE);
            // todo send host n port
            return { gottiId } ;
        } else {
            return false;
        }
    }

    //TODO: maybe need to ping gate before?
    private registerGateResponders() {
        this.responder.createResponse(GateProtocol.HEARTBEAT + '-' +  this.serverIndex, () => {
            return [this.serverIndex, this.clients.length];
        });
        this.responder.createResponse(GateProtocol.RESERVE_PLAYER_SEAT + '-' +  this.serverIndex, this._requestJoin.bind(this))
    }
}

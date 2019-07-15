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
const msgpack = require('notepack.io');

import * as net from 'net';
import * as http from 'http';

import { merge, spliceOne, generateId, parseQueryString } from './Util';

import * as parseURL from 'url-parse';

import * as WebSocket from 'ws';
import { ServerOptions as IServerOptions } from 'ws';

import { Messenger as Responder } from 'gotti-reqres/dist';
import { Messenger as Subscriber } from 'gotti-pubsub/dist';

import {FrontMaster, Client as ChannelClient, FrontChannel} from 'gotti-channels/dist';
import { decode, Protocol, GateProtocol, GOTTI_RELAY_CHANNEL_ID, send, WS_CLOSE_CONSENTED, GOTTI_MASTER_CHANNEL_ID  } from './Protocol';

import * as fossilDelta from 'fossil-delta';

const nanoid = require('nanoid');

import { EventEmitter } from 'events';

import { ConnectorClient as Client } from './ConnectorClient';
import {setInterval} from "timers";

//import { debugAndPrintError, debugPatch, debugPatchData } from '../../colyseus/lib/Debug';

const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)
const DEFAULT_SIMULATION_INTERVAL = 1000 / 60; // 60fps (16.66ms)

const DEFAULT_SEAT_RESERVATION_TIME = 3;

const DEFAULT_RELAY_RATE = 1000 / 30; // 30fpS

export type SimulationCallback = (deltaTime?: number) => void;

export type ConnectorOptions = IServerOptions & {
    pingTimeout?: number,
    gracefullyShutdown?: boolean,
    server: string,
    port?: number,
    messageRelayRate?: number,
    serverIndex: number,
    connectorURI: string,
    gateURI: string,
    masterServerURI?: string,
    areaRoomIds: Array<string>,
    areaServerURIs: Array<string>,
    relayURI?: string,
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

    public areaOptions: {[areaId: string]: any};

    public options: ConnectorOptions;

    public serverIndex: number;
    public connectorURI: string;
    public areaRoomIds: Array<string>;
    public areaServerURIs: Array<string>;
    public port: number;

    public roomName: string;
    public maxClients: number = Infinity;
    public patchRate: number = DEFAULT_PATCH_RATE;
    public autoDispose: boolean = true;
    public state: any;
    public metadata: any = null;

    public masterChannel: FrontMaster = null;
    public channels: any;

    public clients: Client[] = [];
    public clientsById: {[gottiId: string]: Client} = {};

    private _patchInterval: NodeJS.Timer;
    private _relayMessageTimeout: NodeJS.Timer;

    private server: any;
    private gateURI: string;
    private masterServerURI: string;
    private relayURI: string;

    private responder: Responder;

    private reservedSeats: {[clientId: string]: any} = {};

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

        if(options.server === 'http') {
            this.httpServer = http.createServer();
            this.options.server = this.httpServer;
        } else if(options.server === 'net') {
        } else {
            throw 'please use http or net as server option'
        }

        this.responder = new Responder({
            response: true,
            id: `${this.serverIndex}_responder`,
            brokerURI: options.gateURI,
        });

        this.registerGateResponders();
        //this.setPatchRate(this.patchRate);
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

    protected onConnection = (client: Client, req: http.IncomingMessage & any) => {
        client.pingCount = 0;

        const upgradeReq = req || client.upgradeReq;
        const url = parseURL(upgradeReq.url);
        const query = parseQueryString(url.query);
        req.gottiId = query.gottiId;

        if(!(client) || !(req.gottiId) || !(this.reservedSeats[req.gottiId]) ) {
            send(client, [Protocol.JOIN_CONNECTOR_ERROR])
        } else {
            client.gottiId = req.gottiId;
            client.playerIndex = this.reservedSeats[req.gottiId].playerIndex
            this._onJoin(client, this.reservedSeats[req.gottiId].auth, this.reservedSeats[req.gottiId].seatOptions);
        }

        // prevent server crashes if a single client had unexpected error
        client.on('error', (err) => console.error(err.message + '\n' + err.stack));
        //send(client, [Protocol.USER_ID, client.gottiId])
    };

    public async connectToAreas() : Promise<boolean> {
        this.masterChannel = new FrontMaster(this.serverIndex);
        let backChannelURIs = [...this.areaServerURIs];
        let backChannelIds = [...this.areaRoomIds];
        if(this.masterServerURI) {
            backChannelURIs.push(this.masterServerURI);
            backChannelIds.push(GOTTI_MASTER_CHANNEL_ID);
        }
        if(this.relayURI) {
            backChannelURIs.push(this.relayURI);
            backChannelIds.push(GOTTI_RELAY_CHANNEL_ID);
        } else {
            throw new Error('Connector.connectToAreas is failing because we dont have a relayURI specified! Gotti-Servers v0.2.5 and up require you set up a relay server.')
        }
        this.masterChannel.initialize(this.connectorURI, backChannelURIs);
        this.masterChannel.addChannels(backChannelIds);

        this.channels = this.masterChannel.frontChannels;
        this.relayChannel = this.channels[GOTTI_RELAY_CHANNEL_ID];
        if(this.channels[GOTTI_MASTER_CHANNEL_ID]) {
            this.masterServerChannel = this.channels[GOTTI_MASTER_CHANNEL_ID];
        }

        //TODO: right now you need to wait a bit after connecting and binding to uris will refactor channels eventually to fix this
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.masterChannel.connect().then((connection) => {
                    this.areaOptions = connection.backChannelOptions;
                    this.registerChannelMessages();
                    this.server = new WebSocket.Server(this.options);
                    this.server.on('connection', this.onConnection.bind(this));
                    this.on('connection', this.onConnection.bind(this)); // used for testing
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
    public onJoin?(client: Client): any | Promise<any>;
    public onLeave?(client: Client, consented?: boolean): void | Promise<any>;
    public onDispose?(): void | Promise<any>;
    public onAuth?(options: any): boolean;

    /**
     * @param auth - authentication data sent from Gate server.
     * @param seatOptions - additional options that may have sent from gate server, you can add/remove properties
     * to it in request join and it will persist onto the client object.
     * @returns {number}
     */
    public requestJoin(auth: any, seatOptions: any): number | boolean {
        return 1;
    }

    public async disconnect(closeHttp: boolean=true) : Promise<boolean> {
        this.stopMessageRelay();
        this.autoDispose = true;

        let i = this.clients.length;
        while (i--) {
            const client = this.clients[i];
            client.close(WS_CLOSE_CONSENTED);
        }
        if(this.masterChannel) {
            this.masterChannel.disconnect();
        }

        return new Promise((resolve, reject) => {
            if(closeHttp) {
                this.httpServer.forceShutdown(() => {
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
     * @param areaOptions - options set on area before the game to help connector figure out which area to return
     * @param clientOptions - options sent from the client when starting the game.
     * @returns { areaId: string, options: any } - areaId the client is going to write to and any additional options to send.
     */
    public abstract getInitialWriteArea(client: Client, areaOptions, clientOptions?) : { areaId: string, options: any }

    protected broadcast(data: any, options?: BroadcastOptions): boolean {
        // no data given, try to broadcast patched state
        if (!data) {
            throw new Error('Room#broadcast: \'data\' is required to broadcast.');
        }

        let numClients = this.clients.length;
        while (numClients--) {
            const client = this.clients[ numClients ];
            if ((!options || options.except !== client)) {
                send(client, data, false);
            }
        }
        return true;
    }

    private registerClientAreaMessageHandling(client) {
        client.channelClient.onMessage((message) => {
            if(message[0] === Protocol.SYSTEM_MESSAGE || message[0] === Protocol.IMMEDIATE_SYSTEM_MESSAGE) {
                send(client, message);
            } else if (message[0] === Protocol.ADD_CLIENT_AREA_LISTEN) {
                // message[1] areaId,
                // message[2] options
                this.addAreaListen(client, message[1], message[2]);
            }
            else if (message[0] === Protocol.REMOVE_CLIENT_AREA_LISTEN) {
                this.removeAreaListen(client, message[1], message[2]);
            }
            else if(message[0] === Protocol.SET_CLIENT_AREA_WRITE) {
                // the removeOldWriteListener will be false since that should be explicitly sent from the old area itself.
                this.changeAreaWrite(client, message[1], message[2]);
            } else {
                throw new Error('Unhandled client message protocol'+ message[0]);
            }
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

            let registerHandler = this.registerAreaMessages;

            // change register handler if the channel id was a specified gotti frameworked channel id
            if(channelId === GOTTI_MASTER_CHANNEL_ID) {
                registerHandler = this.registerMasterServerMessages;
            } else if(channelId === GOTTI_RELAY_CHANNEL_ID) {
                registerHandler = this.registerRelayMessages;
            }

            registerHandler(channel);
        }
    }

    private registerMasterServerMessages(masterServerChannel) {
        if(masterServerChannel) {
            masterServerChannel.onMessage((message) => {
                this.onMasterMessage && this.onMasterMessage(message);
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
                console.log('Connector.registerRelayMessages ENABLED_CLIENT_P2P_SUCCESS for player', message[1]);
                const client = this.clientsById[message[1]];
                if(client) {
                    client.p2p = true;
                    send(this.clientsById[message[1]], [Protocol.ENABLED_CLIENT_P2P_SUCCESS]);
                }
            } else if(protocol === Protocol.SIGNAL_SUCCESS) {
                //[Protocol.SIGNAL_SUCCESS, fromPlayerIndex,  fromPlayerSignalData, toPlayerrGottiId], toPlayerData.connectorId)
                const toClient = this.clientsById[message[3]];
                console.log('Connector.registerRelayMessages SIGNAL_SUCCESS sending to player', toClient.gottiId, 'from player index:', message[1], 'and the signalData was', message[2]);

                // sends the sdp and ice to other client of client
                if(toClient) {
                    // [protocol, fromPlayerIndex, fromPlayerSignalData]
                    send(toClient, [protocol, message[1], message[2]])
                }
            } else if(protocol === Protocol.PEER_REMOTE_SYSTEM_MESSAGE) {

            }
        });
    }

    private registerAreaMessages(areaChannel: FrontChannel) {
        areaChannel.onMessage((message) => {
            if(message[0] === Protocol.SYSTEM_MESSAGE || message[0] === Protocol.IMMEDIATE_SYSTEM_MESSAGE) {
                // add from area id
                // get all listening clients for area/channel
                const listeningClientUids = areaChannel.listeningClientUids;
                let numClients = listeningClientUids.length;
                // iterate through all and relay message
                message =  msgpack.encode(message);
                while (numClients--) {
                    const client = this.clientsById[ listeningClientUids[numClients] ];
                    send(client, message, false);
                }
            } else if (message[0] === Protocol.AREA_TO_AREA_SYSTEM_MESSAGE) {
                // [protocol, type, data, to, from, areaIds]
                const toAreaIds = message[5];
                // reassign last value in array to the from area id
                message[5] = areaChannel.channelId;
                areaChannel.broadcast(message, toAreaIds)
            }
        });
    }


    private async _getInitialWriteArea(client, clientOptions?: any) : Promise<boolean> {
        const write = this.getInitialWriteArea(client, this.areaOptions, clientOptions);
        if(write) {
            // will dispatch area messages to systems
            await this.changeAreaWrite(client, write.areaId, write.options);
            return true;
        } else {
            send(client, Protocol.WRITE_AREA_ERROR);
            return false;
        }
    }


    private _onWebClientMessage(client: Client, message: any) {
        let decoded = decode(message);
        if (!decoded) {
        //    debugAndPrintError(`${this.roomName} (${this.roomId}), couldn't decode message: ${message}`);
            return;
        }
        const protocol = decoded[0];

        if (protocol === Protocol.SYSTEM_MESSAGE) {
            client.channelClient.sendLocal(decoded);
        } else if(protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE) {
            client.channelClient.sendLocalImmediate(decoded);
        } else if(protocol === Protocol.GET_INITIAL_CLIENT_AREA_WRITE) {
            this._getInitialWriteArea(client, decoded[1])
        } else if(protocol === Protocol.PEER_REMOTE_SYSTEM_MESSAGE){
            console.log('Connector _onWebClientMessage handlng PEER_REMOTE_SYSTEM_MESSAGE for peer', decoded[1], 'from player:', client.gottiId);
            //[Protocol.PEER_REMOTE_SYSTEM_MESSAGE, peerIndex, message.type, message.data, message.to, message.from, playerIndex]);
            this.relayChannel.send([...decoded, client.playerIndex])
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
                console.log('Connector _onWebClientMessage handlng CLIENT_WEB_RTC_ENABLED for client with player index', client.playerIndex);
                this.relayChannel.send([Protocol.CLIENT_WEB_RTC_ENABLED, client.playerIndex])
            }
        } else if(protocol === Protocol.DISABLED_CLIENT_P2P) {
                // [sdp, ice]
            this.relayChannel.send([Protocol.DISABLED_CLIENT_P2P, client.playerIndex]);
        } else if(protocol === Protocol.SIGNAL_REQUEST) {
                // [protocol, toPlayerIndex, { sdp, candidate }
            console.log('Connector _onWebClientMessage handlng SIGNAL_REQUEST that should be sent to', decoded[1], 'and from playerIndex:', client.playerIndex, 'the sdp/candidate info was', decoded[2]);
            this.relayChannel.send([decoded[1], decoded[2], client.playerIndex, this.relayChannel.frontUid]);
        }
    }

    private async addAreaListen(client, areaId, options?) : Promise<boolean> {
        try{
            const linkedResponse = await client.channelClient.linkChannel(areaId, options);

            /* adds newest state from listened area to the clients queued state updates as a 'SET' update
             sendState method forwards then empties that queue, any future state updates from that area
             will be added to the client's queue as 'PATCH' updates. */
           // this.sendState(client);

            send(client, [Protocol.ADD_CLIENT_AREA_LISTEN, areaId, linkedResponse]);

            return true;
        } catch(err) {
            console.log('clientId was:', client.gottiId);
            console.log('areaId was', areaId);
            console.log('error in addAreaListen was', err);
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

        const oldAreaId = client.channelClient.processorChannel;

        let isLinked = client.channelClient.isLinkedToChannel(newAreaId);
        if(!(isLinked)) {
            isLinked = await this.addAreaListen(client, newAreaId, writeOptions);
        }

        if(isLinked) {
            const success = client.channelClient.setProcessorChannel(newAreaId, false, writeOptions);
            if(success) {
                send(client, [Protocol.SET_CLIENT_AREA_WRITE, newAreaId, writeOptions]);
                return true;
            }
        }
        return false;
    }

    private removeAreaListen(client, areaId, options) {
        if(!(this.masterChannel.frontChannels[areaId]))  { console.error('invalid areaId') }

        client.channelClient.unlinkChannel(areaId);

        send(client, [Protocol.REMOVE_CLIENT_AREA_LISTEN, areaId, options]);
    }

    private _onJoin(client, auth: any, seatOptions: any) {
        // clear the timeout and remove the reserved seat since player joined
        clearTimeout(this.reservedSeats[client.gottiId].timeout);
        delete this.reservedSeats[client.gottiId];

        // add a channelClient to client
        client.channelClient = new ChannelClient(client.gottiId, this.masterChannel);
        // register channel/area message handlers
        this.registerClientAreaMessageHandling(client);
        this.clients.push( client );
        this.clientsById[client.gottiId] = client;
        client.auth = auth;
        client.seatOptions = seatOptions;
        let joinOptions = null;
        if(this.onJoin) {
            joinOptions = this.onJoin(client)
        }
        client.auth = auth;
        client.seatOptions = seatOptions;

        send(client, [ Protocol.JOIN_CONNECTOR, this.areaOptions, joinOptions ]);

        if(this.relayChannel) { // notify the relay server of client with connector for failed p2p system messages to go through
            this.relayChannel.send([Protocol.JOIN_CONNECTOR, client.playerIndex, client.gottiId, this.relayChannel.frontUid])
        } else {
            throw new Error('Connector._onJoin is failing because we dont have a relayURI specified! Gotti-Servers v0.2.5 and up require you set up a relay server.')
        }

        client.on('message', this._onWebClientMessage.bind(this, client));
        client.once('close', this._onLeave.bind(this, client));
    }

    private async _onLeave(client: Client, code?: number): Promise<any> {
        // call abstract 'onLeave' method only if the client has been successfully accepted.
        if(this.relayChannel) {
            this.relayChannel.send([Protocol.LEAVE_CONNECTOR, client.playerIndex, client.playerIndex]);
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
     * @param seatOptions - additional data sent from the gate
     * @private
     */
    private _reserveSeat(clientId, playerIndex, auth, seatOptions) {
        this.reservedSeats[clientId] = {
            auth,
            playerIndex,
            seatOptions,
            timeout: setTimeout(() => {
                delete this.reservedSeats[clientId];
            }, 10000) // reserve seat for 10 seconds
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
        const seatOptions = data && data.seatOptions ? data.seatOptions : {};

        if(this.requestJoin(auth, seatOptions)) {
            const gottiId = generateId();

            this._reserveSeat(gottiId, playerIndex, auth, seatOptions);
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

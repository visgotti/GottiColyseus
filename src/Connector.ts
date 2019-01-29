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

import * as net from 'net';
import * as http from 'http';

import { merge, spliceOne } from './Util';

//import * as parseURL from 'url-parse';
import * as WebSocket from 'ws';
import { ServerOptions as IServerOptions } from 'ws';

import { Messenger as Responder } from 'gotti-reqres/dist';

import { FrontMaster, Client as ChannelClient } from 'gotti-channels/dist';
import { decode, Protocol, GateProtocol, send, WS_CLOSE_CONSENTED  } from './Protocol';

import * as fossilDelta from 'fossil-delta';

const msgpack = require('notepack.io');
const nanoid = require('nanoid');

import { EventEmitter } from 'events';

import { ConnectorClient as Client } from './ConnectorClient';

//import { debugAndPrintError, debugPatch, debugPatchData } from '../../colyseus/lib/Debug';

const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)
const DEFAULT_SIMULATION_INTERVAL = 1000 / 60; // 60fps (16.66ms)

const DEFAULT_SEAT_RESERVATION_TIME = 3;

export type SimulationCallback = (deltaTime?: number) => void;

export type ConnectorOptions = IServerOptions & {
    constructorPath: string,
    pingTimeout?: number,
    verifyClient?: WebSocket.VerifyClientCallbackAsync
    gracefullyShutdown?: boolean,
    server: 'string',
    port?: number,
    serverIndex: number,
    connectorURI: string,
    gateURI: string,
    areaRoomIds: Array<string>,
    areaServerURIs: Array<string>,
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
    public clientsById: {[sessionId: string]: Client} = {};

    private _patchInterval: NodeJS.Timer;

    private server: any;
    private gateURI: string;
    private responder: Responder;
    private reservedSeats: {[clientId: string]: any}

    constructor(options: ConnectorOptions) {
        super();

        this.areaRoomIds = options.areaRoomIds;
        this.connectorURI = options.connectorURI;
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
            id: `${this.serverIndex}_responder`,
            brokerURI: options.gateURI,
        });

        //this.setPatchRate(this.patchRate);
    }

    protected onConnection = (client: Client, req?: http.IncomingMessage & any) => {
        const upgradeReq = req || client.upgradeReq;
        client.pingCount = 0;


        if(!(client.auth) || !(client.auth.id) || !(this.reservedSeats[client.auth.id]) ) {
            // send(client, [Protocol.JOIN_CONNECTOR_ERROR])
        } else {
            const { auth, options } = client;
            this._onJoin(client, auth, options);
        }

        // prevent server crashes if a single client had unexpected error
        client.on('error', (err) => console.error(err.message + '\n' + err.stack));
        //send(client, [Protocol.USER_ID, client.id])
    };

    public async connectToAreas() : Promise<boolean> {
        this.masterChannel = new FrontMaster(this.serverIndex);
        this.masterChannel.initialize(this.connectorURI, this.areaServerURIs);
        this.masterChannel.addChannels(this.areaRoomIds);
        this.channels = this.masterChannel.frontChannels;

        //TODO: right now you need to wait a bit after connecting and binding to uris will refactor channels eventually to fix this
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.masterChannel.connect().then((connection) => {

                    this.areaOptions = connection.backChannelOptions;
                    this.registerAreaMessages();

                    this.server = new WebSocket.Server(this.options);
                    this.httpServer.on('connection', this.onConnection);
                    this.on('connection', this.onConnection); // used for testing

                    console.log(`Connector ${this.serverIndex} succesfully listening for client connections on port ${this.port}`)

                    return resolve(true);
                });
            }, 500);
        });
    }

    // Abstract methods
    public abstract onMessage(client: Client, message: any): void;

    // added abstract methods
    public onAddedAreaListen?(client: any, areaId: string, options?: any): void | Promise<any>;
    public onRemovedAreaListen?(client: any, areaId: string, options?: any): void | Promise<any>;
    public onChangedAreaWrite?(client: any, newAreaId: string, oldAreaId?: string): void | Promise<any>;

    // Optional abstract methods
    public onInit?(options: any): void;

    // auth is the data that was sent from the gate channel and options is any data passed from client on connection
    public onJoin?(client: Client, any, auth: any,  options?): void | Promise<any>;
    public onLeave?(client: Client, consented?: boolean): void | Promise<any>;
    public onDispose?(): void | Promise<any>;
    public onAuth?(options: any): boolean;

    /**
     * @param clientId - id client authenticated from gate server as
     * @param auth - authentication data sent from Gate server.
     * @returns {number}
     */
    public requestJoin(clientId: string, auth: any): number | boolean {
        return 1;
    }

    public send(client: Client, data: any): void {
        send(client, [Protocol.AREA_DATA, data]);
    }

    public async disconnect(closeHttp: boolean=true) : Promise<boolean> {
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

    /*
    protected sendState(client: Client): void {

        const stateUpdates = client.channelClient.queuedEncodedUpdates;
        if (stateUpdates.length) {

            send(client, [
                    Protocols.STATE_UPDATES,
                    stateUpdates
                //this.clock.currentTime,
                //this.clock.elapsedTime]
            );
            // clear updates after sent.
            client.channelClient.clearStateUpdates();
        }
    }
    */
    private _onAreaMessages() {
        /*
         this.masterChannel.frontChannels.forEach((frontChannel) => {
         frontChannel.onMessage((data, channelId) => {
         switch(data.protocol) {
         case GottiProtocol.MESSAGE_QUEUE_RELAY,
         case Protocol.ROOM_DATA,
         }
         });
         });
         */
    }

    private registerClientAreaMessageHandling(client) {
        client.channelClient.onMessage((message) => {
            if (message[0] === Protocol.REQUEST_LISTEN_AREA) {
                // message[1] areaId,
                // message[2] options
                this.addAreaListen(client, message[1], message[2]);
            }
            else if (message[0] === Protocol.REQUEST_REMOVE_LISTEN_AREA) {
                this.removeAreaListen(client, message[1], message[2]);
            }
            else if(message[0] === Protocol.REQUEST_WRITE_AREA) {
                // the removeOldWriteListener will be false since that should be explicitly sent from the old area itself.
                this.changeAreaWrite(client, message[1], message[2]);
            } else if(message[0] === Protocol.AREA_DATA || message[0] === Protocol.GLOBAL_DATA) {
               // send(client, message);
            } else {
                throw new Error('Unhandled client message protocol'+ message[0]);
            }
        });
    }

    private registerAreaMessages() {
        Object.keys(this.channels).forEach(channelId => {
            const channel = this.channels[channelId];
            channel.onMessage((message) => {
                if(message[0] === Protocol.AREA_DATA || message[0] === Protocol.GLOBAL_DATA) {
                    let numClients = channel.listeningClientUids.length;
                    while (numClients--) {
                        const client = this.clients[ numClients ];
                        send(client, message, false);
                    }
                }
            });
        });
    }

    private _onAreaMessage(message) {
        this.broadcast(message);
    }

    private _onWebClientMessage(client: Client, message: any) {
        message = decode(message);
        if (!message) {
        //    debugAndPrintError(`${this.roomName} (${this.roomId}), couldn't decode message: ${message}`);
            return;
        }

        if (message[0] === Protocol.SYSTEM_MESSAGE) {
            client.channelClient.sendLocal(message[1]);
        } else if (message[0] === Protocol.REQUEST_LISTEN_AREA) {
            this._requestAreaListen(client, message[1], message[2]);
        } else if (message[0] === Protocol.REQUEST_REMOVE_LISTEN_AREA) {
            this._requestRemoveAreaListen(client, message[1], message[2]);
        } else if(message[0] === Protocol.REQUEST_WRITE_AREA) {
            this._requestAreaWrite(client, message[1], message[2]);
        } else if (message[0] === Protocol.LEAVE_CONNECTOR) {
            // stop interpreting messages from this client
            client.removeAllListeners('message');
            // prevent "onLeave" from being called twice in case the connection is forcibly closed
            client.removeAllListeners('close');

            // only effectively close connection when "onLeave" is fulfilled
            this._onLeave(client, WS_CLOSE_CONSENTED).then(() => client.close());
        }
    }

    private async addAreaListen(client, areaId, options?) : Promise<boolean> {
        try{
            const { responseOptions } = await client.channelClient.linkChannel(areaId, options);

            const combinedOptions = responseOptions ? merge(options, responseOptions) : options;

            /* adds newest state from listened area to the clients queued state updates as a 'SET' update
             sendState method forwards then empties that queue, any future state updates from that area
             will be added to the client's queue as 'PATCH' updates. */
           // this.sendState(client);

            this.onAddedAreaListen && this.onAddedAreaListen(client, areaId, combinedOptions);

            send(client, [Protocol.REQUEST_LISTEN_AREA, areaId, combinedOptions]);

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

        const oldAreaId = client.channelClient.processorChannel;

        let isLinked = client.channelClient.isLinkedToChannel(newAreaId);
        if(!(isLinked)) {
            isLinked = await this.addAreaListen(client, newAreaId, writeOptions);
        }

        if(isLinked) {
            const success = client.channelClient.setProcessorChannel(newAreaId, false, writeOptions);
            if(success) {
                this.onChangedAreaWrite(client, newAreaId, oldAreaId);
                send(client, [Protocol.REQUEST_WRITE_AREA, newAreaId]);
                return true;
            }
        }
        return false;
    }

    private removeAreaListen(client, areaId, options) {
        if(!(this.masterChannel.frontChannels[areaId]))  { console.error('invalid areaId') }

        client.channelClient.unlinkChannel(areaId);

        this.onRemovedAreaListen(client, areaId, options);

        send(client, [Protocol.REQUEST_REMOVE_LISTEN_AREA, areaId]);
    }

    /**
     * Used for validating user requested area changes.
     * if provided, options get sent to area and will
     * return asynchronously with response options from area
     * or a boolean indicating success
     */
    private async _requestAreaListen(client: Client, areaId: string, options?: any) : Promise<boolean>  {
        const frontChannel = this.masterChannel.frontChannels[areaId];
        if(!(frontChannel)) return false;

        const { responseOptions } = await client.channelClient.linkChannel(areaId, options);

        const combinedOptions = responseOptions ? merge(options, responseOptions) : options;

        /* adds newest state from listened area to the clients queued state updates as a 'SET' update
         sendState method forwards then empties that queue, any future state updates from that area
         will be added to the client's queue as 'PATCH' updates. */
        // this.sendState(client);

        this.onAddedAreaListen && this.onAddedAreaListen(client, areaId, combinedOptions);

        send(client, [Protocol.REQUEST_LISTEN_AREA, areaId, combinedOptions]);
    }

    private _requestRemoveAreaListen(client: Client, areaId: string, options?: any) {
        const frontChannel = this.masterChannel.frontChannels[areaId];
        if(!(frontChannel)) return false;
        frontChannel.send([Protocol.REQUEST_REMOVE_LISTEN_AREA, options], areaId, client.id);
    }

    private async _requestAreaWrite(client: Client, newAreaId: string, options?: any) {
        const processorChannelId = client.channelClient.processorChannel;
        if(!(processorChannelId)) throw 'Client needs a processor channel before making area write requests.';
        // const changed = await this.changeAreaWrite(client, newAreaId, options);
        const frontChannel = this.masterChannel.frontChannels[newAreaId];
        frontChannel.send([Protocol.REQUEST_WRITE_AREA, newAreaId, options], client.channelClient.processorChannel, client.id);
    }


    private _onJoin(client: Client, auth: any, options?: any,) {

        // clear the timeout and remove the reserved seat since player joined
        clearInterval(this.reservedSeats[auth.id].timeout);
        delete this.reservedSeats[auth.id];

        // add a channelClient to client
        client.channelClient = new ChannelClient(client.sessionId || client.id, this.masterChannel);
        this.registerClientAreaMessageHandling(client);
        this.clients.push( client );
        this.clientsById[client.id] = client;

        // confirm room id that matches the room name requested to join
        //send(client, [ Protocol.JOIN_CONNECTOR, client.sessionId, client.id, this.gameId, this.areaOptions ]);

        client.on('message', this._onWebClientMessage.bind(this, client));
        client.once('close', this._onLeave.bind(this, client));

        return this.onJoin && this.onJoin(client, options, auth);
    }

    private async _onLeave(client: Client, code?: number): Promise<any> {
        // call abstract 'onLeave' method only if the client has been successfully accepted.
        if (spliceOne(this.clients, this.clients.indexOf(client)) && this.onLeave) {
            delete this.clientsById[client.sessionId];
            // disconnect gotti client too.
            client.channelClient.unlinkChannel();
            await this.onLeave(client, (code === WS_CLOSE_CONSENTED));
            //TODO: notify gate server
        }

        this.emit('leave', client);
    }

    /**
     * reserves seat till player joins
     * @param clientId - id of player to reserve seat for
     * @param auth - data player authenticated with on gate.
     * @private
     */
    private _reserveSeat(clientId, auth) {
        this.reservedSeats[clientId] = auth;
    }

    /**
     * Handles request from gate server, whatever this returns gets sent back to the gate server
     * to notify it if the reserve seat request went through or not.
     * @param data - data sent from gate server after play authenticated
     * @private
     */
    private _requestJoin(data) {
        const clientId = data[0];
        const auth = data[1];

        if(this.requestJoin(clientId, auth)) {
            this._reserveSeat(clientId, auth);
            return true;
        } else {
            return false;
        }
    }

    //TODO: maybe need to ping gate before?
    private registerGateResponders() {
        this.responder.createResponse(GateProtocol.HEARTBEAT, () => {
            return [this.serverIndex, this.clients.length];
        });
        this.responder.createResponse(GateProtocol.RESERVE_PLAYER_SEAT, this._requestJoin.bind(this))
    }
}

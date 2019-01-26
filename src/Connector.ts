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

import { FrontMaster, Client as ChannelClient } from 'gotti-channels/dist';
import { decode, Protocol, send, WS_CLOSE_CONSENTED  } from './Protocol';

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
    pingTimeout?: number,
    verifyClient?: WebSocket.VerifyClientCallbackAsync
    gracefullyShutdown?: boolean,
    server: net.Server | http.Server,
    roomId: string,
    serverIndex: number,
    masterURI: string,
    channelIds: Array<string>,
    areaURIs: Array<string>
};

export interface RoomAvailable {
    roomId: string;
    clients: number;
    maxClients: number;
    metadata?: any;
}

export interface BroadcastOptions {
    except: Client;
}

export abstract class Connector extends EventEmitter {
    protected httpServer: any;
    public roomId: string;
    public serverIndex: number;
    public masterURI: string;
    public channelIds: Array<string>;
    public areaURIs: Array<string>;
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

    constructor(options: ConnectorOptions) {
        super();
        this.roomId = options.roomId;
        this.channelIds = options.channelIds;
        this.masterURI = options.masterURI;
        this.areaURIs = options.areaURIs;
        this.serverIndex = options.serverIndex;

        this.server = new WebSocket.Server(options);
        this.httpServer = options.server;
        this.httpServer.on('connection', this.onConnection);
        this.on('connection', this.onConnection); // used for testing
        //this.setPatchRate(this.patchRate);
    }

    protected onConnection = (client: Client, req?: http.IncomingMessage & any) => {
        const upgradeReq = req || client.upgradeReq;
        client.id = nanoid(9);
        client.pingCount = 0;

        client.options = upgradeReq.options;
        client.auth = upgradeReq.auth;

        const auth = this.onAuth(client.options);
        if(!(auth)) {
           // send(client, [Protocol.JOIN_CONNECTOR_ERROR])
        }

        //TODO isnew
        const joinedOptions = this.requestJoin(auth, false);
        if(joinedOptions) {
            this._onJoin(client, joinedOptions, auth);
        }

        // prevent server crashes if a single client had unexpected error
        client.on('error', (err) => console.error(err.message + '\n' + err.stack));
        //send(client, [Protocol.USER_ID, client.id])
    };

    public async connectToAreas() : Promise<boolean> {
        this.masterChannel = new FrontMaster(this.serverIndex);

        this.masterChannel.initialize(this.masterURI, this.areaURIs);
        this.masterChannel.addChannels(this.channelIds);
        this.channels = this.masterChannel.frontChannels;

        //TODO: right now you need to wait a bit after connecting and binding to uris will refactor channels eventually to fix this
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.masterChannel.connect().then(() => {
                    this.registerAreaMessages();
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
    public onAddedAreaWrite?(client: any, areaId: string): void | Promise<any>;
    public onRemovedAreaWrite?(client: any, areaId: string): void | Promise<any>;

    // Optional abstract methods
    public onInit?(options: any): void;
    public onJoin?(client: Client, options?: any, auth?: any): void | Promise<any>;
    public onLeave?(client: Client, consented?: boolean): void | Promise<any>;
    public onDispose?(): void | Promise<any>;
    public onAuth?(options: any): boolean;

    public requestJoin(options: any, isNew?: boolean): number | boolean {
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
            console.log('calling')
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
        } else {
            this.onMessage(client, message);
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
     * Function that will send a notifcation to the area telling it that a new client has just become
     * a new writer, and it will trigger the onJoin hook with the sessionId of client and any options
     * you pass in as the write options. You must be a listener to the area before writing to it, this
     * is because all writers listen and listening where the real handshaking between the connector and
     * area is done. This will automatically listen before writing- therefore you have the optional listenOptions
     * in case you've configured your area to do specific things on the area room's onListen hook. Which will always be called
     * first before the onJoin. oldWriteOptions will be sent to the previous writing area and trigger the onLeave hook of that area.
     * You are still listening to the area after you leave as a writer, you must call removeClientListen if you want
     * the client to completely stop listening for messages and state updates.
     * @param client
     * @param newAreaId - new area id that will become the writer
     * @param writeOptions - options that get sent with the new write client notification to the new area
     * @returns {boolean}
     */
    private async changeAreaWrite(client, newAreaId, writeOptions) : Promise<boolean> {
        const success = client.channelClient.setProcessorChannel(newAreaId, false, writeOptions);
        if(success) {
            this.onAddedAreaWrite(client, newAreaId);
            send(client, [Protocol.REQUEST_WRITE_AREA, newAreaId]);
            return true;
        } else {
            return false;
        }
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

    private _requestAreaWrite(client: Client, newAreaId: string, options?: any) {
        const frontChannel = this.masterChannel.frontChannels[newAreaId];
        if(!(frontChannel)) return false;
        frontChannel.send([Protocol.REQUEST_REMOVE_LISTEN_AREA, options], newAreaId, client.id);
    }

    private _onJoin(client: Client, options?: any, auth?: any) {
        // create remote client instance.

        // add a channelClient to client
        client.channelClient = new ChannelClient(client.sessionId || client.id, this.masterChannel);
        this.registerClientAreaMessageHandling(client);
        this.clients.push( client );
        this.clientsById[client.id] = client;

        // confirm room id that matches the room name requested to join
        //send(client, [ Protocol.JOIN_CONNECTOR, client.sessionId ]);

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
        }

        this.emit('leave', client);
    }
}

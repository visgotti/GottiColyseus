"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const http = require("http");
const Util_1 = require("./Util");
//import * as parseURL from 'url-parse';
const WebSocket = require("ws");
const dist_1 = require("gotti-channels/dist");
const Protocol_1 = require("./Protocol");
const msgpack = require('notepack.io');
const nanoid = require('nanoid');
const events_1 = require("events");
//import { debugAndPrintError, debugPatch, debugPatchData } from '../../colyseus/lib/Debug';
const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)
const DEFAULT_SIMULATION_INTERVAL = 1000 / 60; // 60fps (16.66ms)
const DEFAULT_SEAT_RESERVATION_TIME = 3;
class Connector extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.maxClients = Infinity;
        this.patchRate = DEFAULT_PATCH_RATE;
        this.autoDispose = true;
        this.metadata = null;
        this.masterChannel = null;
        this.clients = [];
        this.clientsById = {};
        this.onConnection = (client, req) => {
            const upgradeReq = req || client.upgradeReq;
            client.id = nanoid(9);
            client.pingCount = 0;
            client.options = upgradeReq.options;
            client.auth = upgradeReq.auth;
            const auth = this.onAuth(client.options);
            if (!(auth)) {
                // send(client, [Protocol.JOIN_CONNECTOR_ERROR])
            }
            //TODO isnew
            const joinedOptions = this.requestJoin(auth, false);
            if (joinedOptions) {
                this._onJoin(client, joinedOptions, auth);
            }
            // prevent server crashes if a single client had unexpected error
            client.on('error', (err) => console.error(err.message + '\n' + err.stack));
            //send(client, [Protocol.USER_ID, client.id])
        };
        this.areaRoomIds = options.areaRoomIds;
        this.connectorURI = options.connectorURI;
        this.areaServerURIs = options.areaServerURIs;
        this.serverIndex = options.serverIndex;
        this.port = options.port | 8080;
        this.options = options;
        this.options.port = this.port;
        if (options.server === 'http') {
            this.httpServer = http.createServer();
            this.options.server = this.httpServer;
        }
        else if (options.server === 'net') {
        }
        else {
            throw 'please use http or net as server option';
        }
        //this.setPatchRate(this.patchRate);
    }
    connectToAreas() {
        return __awaiter(this, void 0, void 0, function* () {
            this.masterChannel = new dist_1.FrontMaster(this.serverIndex);
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
                        console.log(`Connector ${this.serverIndex} succesfully listening for client connections on port ${this.port}`);
                        return resolve(true);
                    });
                }, 500);
            });
        });
    }
    requestJoin(options, isNew) {
        return 1;
    }
    send(client, data) {
        Protocol_1.send(client, [26 /* AREA_DATA */, data]);
    }
    disconnect(closeHttp = true) {
        return __awaiter(this, void 0, void 0, function* () {
            this.autoDispose = true;
            let i = this.clients.length;
            while (i--) {
                const client = this.clients[i];
                client.close(Protocol_1.WS_CLOSE_CONSENTED);
            }
            if (this.masterChannel) {
                this.masterChannel.disconnect();
            }
            return new Promise((resolve, reject) => {
                if (closeHttp) {
                    this.httpServer.forceShutdown(() => {
                        resolve(true);
                    });
                }
                else {
                    resolve(true);
                }
            });
        });
    }
    broadcast(data, options) {
        // no data given, try to broadcast patched state
        if (!data) {
            throw new Error('Room#broadcast: \'data\' is required to broadcast.');
        }
        let numClients = this.clients.length;
        while (numClients--) {
            const client = this.clients[numClients];
            if ((!options || options.except !== client)) {
                Protocol_1.send(client, data, false);
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
    _onAreaMessages() {
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
    registerClientAreaMessageHandling(client) {
        client.channelClient.onMessage((message) => {
            if (message[0] === 21 /* REQUEST_LISTEN_AREA */) {
                // message[1] areaId,
                // message[2] options
                this.addAreaListen(client, message[1], message[2]);
            }
            else if (message[0] === 24 /* REQUEST_REMOVE_LISTEN_AREA */) {
                this.removeAreaListen(client, message[1], message[2]);
            }
            else if (message[0] === 20 /* REQUEST_WRITE_AREA */) {
                // the removeOldWriteListener will be false since that should be explicitly sent from the old area itself.
                this.changeAreaWrite(client, message[1], message[2]);
            }
            else if (message[0] === 26 /* AREA_DATA */ || message[0] === 30 /* GLOBAL_DATA */) {
                // send(client, message);
            }
            else {
                throw new Error('Unhandled client message protocol' + message[0]);
            }
        });
    }
    registerAreaMessages() {
        Object.keys(this.channels).forEach(channelId => {
            const channel = this.channels[channelId];
            channel.onMessage((message) => {
                if (message[0] === 26 /* AREA_DATA */ || message[0] === 30 /* GLOBAL_DATA */) {
                    let numClients = channel.listeningClientUids.length;
                    while (numClients--) {
                        const client = this.clients[numClients];
                        Protocol_1.send(client, message, false);
                    }
                }
            });
        });
    }
    _onAreaMessage(message) {
        this.broadcast(message);
    }
    _onWebClientMessage(client, message) {
        message = Protocol_1.decode(message);
        if (!message) {
            //    debugAndPrintError(`${this.roomName} (${this.roomId}), couldn't decode message: ${message}`);
            return;
        }
        if (message[0] === 28 /* SYSTEM_MESSAGE */) {
            client.channelClient.sendLocal(message[1]);
        }
        else if (message[0] === 21 /* REQUEST_LISTEN_AREA */) {
            this._requestAreaListen(client, message[1], message[2]);
        }
        else if (message[0] === 24 /* REQUEST_REMOVE_LISTEN_AREA */) {
            this._requestRemoveAreaListen(client, message[1], message[2]);
        }
        else if (message[0] === 20 /* REQUEST_WRITE_AREA */) {
            this._requestAreaWrite(client, message[1], message[2]);
        }
        else if (message[0] === 12 /* LEAVE_CONNECTOR */) {
            // stop interpreting messages from this client
            client.removeAllListeners('message');
            // prevent "onLeave" from being called twice in case the connection is forcibly closed
            client.removeAllListeners('close');
            // only effectively close connection when "onLeave" is fulfilled
            this._onLeave(client, Protocol_1.WS_CLOSE_CONSENTED).then(() => client.close());
        }
    }
    addAreaListen(client, areaId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { responseOptions } = yield client.channelClient.linkChannel(areaId, options);
                const combinedOptions = responseOptions ? Util_1.merge(options, responseOptions) : options;
                /* adds newest state from listened area to the clients queued state updates as a 'SET' update
                 sendState method forwards then empties that queue, any future state updates from that area
                 will be added to the client's queue as 'PATCH' updates. */
                // this.sendState(client);
                this.onAddedAreaListen && this.onAddedAreaListen(client, areaId, combinedOptions);
                Protocol_1.send(client, [21 /* REQUEST_LISTEN_AREA */, areaId, combinedOptions]);
                return true;
            }
            catch (err) {
                //   console.log('error was', err);
                return false;
            }
        });
    }
    /**
     *
     * @param client
     * @param newAreaId - new area id that will become the writer
     * @param writeOptions - options that get sent with the new write client notification to the new area
     * @returns {boolean}
     */
    changeAreaWrite(client, newAreaId, writeOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const oldAreaId = client.channelClient.processorChannel;
            let isLinked = client.channelClient.isLinkedToChannel(newAreaId);
            if (!(isLinked)) {
                isLinked = yield this.addAreaListen(client, newAreaId, writeOptions);
            }
            if (isLinked) {
                const success = client.channelClient.setProcessorChannel(newAreaId, false, writeOptions);
                if (success) {
                    this.onChangedAreaWrite(client, newAreaId, oldAreaId);
                    Protocol_1.send(client, [20 /* REQUEST_WRITE_AREA */, newAreaId]);
                    return true;
                }
            }
            return false;
        });
    }
    removeAreaListen(client, areaId, options) {
        if (!(this.masterChannel.frontChannels[areaId])) {
            console.error('invalid areaId');
        }
        client.channelClient.unlinkChannel(areaId);
        this.onRemovedAreaListen(client, areaId, options);
        Protocol_1.send(client, [24 /* REQUEST_REMOVE_LISTEN_AREA */, areaId]);
    }
    /**
     * Used for validating user requested area changes.
     * if provided, options get sent to area and will
     * return asynchronously with response options from area
     * or a boolean indicating success
     */
    _requestAreaListen(client, areaId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const frontChannel = this.masterChannel.frontChannels[areaId];
            if (!(frontChannel))
                return false;
            const { responseOptions } = yield client.channelClient.linkChannel(areaId, options);
            const combinedOptions = responseOptions ? Util_1.merge(options, responseOptions) : options;
            /* adds newest state from listened area to the clients queued state updates as a 'SET' update
             sendState method forwards then empties that queue, any future state updates from that area
             will be added to the client's queue as 'PATCH' updates. */
            // this.sendState(client);
            this.onAddedAreaListen && this.onAddedAreaListen(client, areaId, combinedOptions);
            Protocol_1.send(client, [21 /* REQUEST_LISTEN_AREA */, areaId, combinedOptions]);
        });
    }
    _requestRemoveAreaListen(client, areaId, options) {
        const frontChannel = this.masterChannel.frontChannels[areaId];
        if (!(frontChannel))
            return false;
        frontChannel.send([24 /* REQUEST_REMOVE_LISTEN_AREA */, options], areaId, client.id);
    }
    _requestAreaWrite(client, newAreaId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const processorChannelId = client.channelClient.processorChannel;
            if (!(processorChannelId))
                throw 'Client needs a processor channel before making area write requests.';
            // const changed = await this.changeAreaWrite(client, newAreaId, options);
            const frontChannel = this.masterChannel.frontChannels[newAreaId];
            frontChannel.send([20 /* REQUEST_WRITE_AREA */, newAreaId, options], client.channelClient.processorChannel, client.id);
        });
    }
    _onJoin(client, options, auth) {
        // create remote client instance.
        // add a channelClient to client
        client.channelClient = new dist_1.Client(client.sessionId || client.id, this.masterChannel);
        this.registerClientAreaMessageHandling(client);
        this.clients.push(client);
        this.clientsById[client.id] = client;
        // confirm room id that matches the room name requested to join
        //send(client, [ Protocol.JOIN_CONNECTOR, client.sessionId, client.id, this.gameId, this.areaOptions ]);
        client.on('message', this._onWebClientMessage.bind(this, client));
        client.once('close', this._onLeave.bind(this, client));
        return this.onJoin && this.onJoin(client, options, auth);
    }
    _onLeave(client, code) {
        return __awaiter(this, void 0, void 0, function* () {
            // call abstract 'onLeave' method only if the client has been successfully accepted.
            if (Util_1.spliceOne(this.clients, this.clients.indexOf(client)) && this.onLeave) {
                delete this.clientsById[client.sessionId];
                // disconnect gotti client too.
                client.channelClient.unlinkChannel();
                yield this.onLeave(client, (code === Protocol_1.WS_CLOSE_CONSENTED));
            }
            this.emit('leave', client);
        });
    }
}
exports.Connector = Connector;

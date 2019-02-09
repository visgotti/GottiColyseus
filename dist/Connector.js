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
Object.defineProperty(exports, "__esModule", { value: true });
const http = require("http");
const Util_1 = require("./Util");
const parseURL = require("url-parse");
const WebSocket = require("ws");
const dist_1 = require("gotti-reqres/dist");
const dist_2 = require("gotti-channels/dist");
const Protocol_1 = require("./Protocol");
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
        this.reservedSeats = {};
        this.onConnection = (client, req) => {
            client.pingCount = 0;
            const upgradeReq = req || client.upgradeReq;
            const url = parseURL(upgradeReq.url);
            const query = Util_1.parseQueryString(url.query);
            req.gottiId = query.gottiId;
            if (!(client) || !(req.gottiId) || !(this.reservedSeats[req.gottiId])) {
                Protocol_1.send(client, [11 /* JOIN_CONNECTOR_ERROR */]);
            }
            else {
                client.gottiId = req.gottiId;
                this._onJoin(client, this.reservedSeats[req.gottiId].auth);
            }
            // prevent server crashes if a single client had unexpected error
            client.on('error', (err) => console.error(err.message + '\n' + err.stack));
            //send(client, [Protocol.USER_ID, client.gottiId])
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
        this.responder = new dist_1.Messenger({
            response: true,
            id: `${this.serverIndex}_responder`,
            brokerURI: options.gateURI,
        });
        this.registerGateResponders();
        //this.setPatchRate(this.patchRate);
    }
    async connectToAreas() {
        this.masterChannel = new dist_2.FrontMaster(this.serverIndex);
        this.masterChannel.initialize(this.connectorURI, this.areaServerURIs);
        this.masterChannel.addChannels(this.areaRoomIds);
        this.channels = this.masterChannel.frontChannels;
        //TODO: right now you need to wait a bit after connecting and binding to uris will refactor channels eventually to fix this
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.masterChannel.connect().then((connection) => {
                    this.areaOptions = connection.backChannelOptions;
                    console.log('area options became', this.areaOptions);
                    this.registerAreaMessages();
                    this.server = new WebSocket.Server(this.options);
                    this.server.on('connection', this.onConnection.bind(this));
                    this.on('connection', this.onConnection.bind(this)); // used for testing
                    console.log(`Connector ${this.serverIndex} succesfully listening for client connections on port ${this.port}`);
                    return resolve(true);
                });
            }, 500);
        });
    }
    /**
     * @param clientId - id client authenticated from gate server as
     * @param auth - authentication data sent from Gate server.
     * @returns {number}
     */
    requestJoin(auth) {
        return 1;
    }
    send(client, data) {
        Protocol_1.send(client, [26 /* AREA_DATA */, data]);
    }
    async disconnect(closeHttp = true) {
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
    async addAreaListen(client, areaId, options) {
        try {
            const { responseOptions } = await client.channelClient.linkChannel(areaId, options);
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
    }
    /**
     *
     * @param client
     * @param newAreaId - new area id that will become the writer
     * @param writeOptions - options that get sent with the new write client notification to the new area
     * @returns {boolean}
     */
    async changeAreaWrite(client, newAreaId, writeOptions) {
        const oldAreaId = client.channelClient.processorChannel;
        let isLinked = client.channelClient.isLinkedToChannel(newAreaId);
        if (!(isLinked)) {
            isLinked = await this.addAreaListen(client, newAreaId, writeOptions);
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
    async _requestAreaListen(client, areaId, options) {
        const frontChannel = this.masterChannel.frontChannels[areaId];
        if (!(frontChannel))
            return false;
        const { responseOptions } = await client.channelClient.linkChannel(areaId, options);
        const combinedOptions = responseOptions ? Util_1.merge(options, responseOptions) : options;
        /* adds newest state from listened area to the clients queued state updates as a 'SET' update
         sendState method forwards then empties that queue, any future state updates from that area
         will be added to the client's queue as 'PATCH' updates. */
        // this.sendState(client);
        this.onAddedAreaListen && this.onAddedAreaListen(client, areaId, combinedOptions);
        Protocol_1.send(client, [21 /* REQUEST_LISTEN_AREA */, areaId, combinedOptions]);
    }
    _requestRemoveAreaListen(client, areaId, options) {
        const frontChannel = this.masterChannel.frontChannels[areaId];
        if (!(frontChannel))
            return false;
        frontChannel.send([24 /* REQUEST_REMOVE_LISTEN_AREA */, options], areaId, client.gottiId);
    }
    async _requestAreaWrite(client, newAreaId, options) {
        const processorChannelId = client.channelClient.processorChannel;
        if (!(processorChannelId))
            throw 'Client needs a processor channel before making area write requests.';
        // const changed = await this.changeAreaWrite(client, newAreaId, options);
        const frontChannel = this.masterChannel.frontChannels[newAreaId];
        frontChannel.send([20 /* REQUEST_WRITE_AREA */, newAreaId, options], client.channelClient.processorChannel, client.gottiId);
    }
    _onJoin(client, auth) {
        // clear the timeout and remove the reserved seat since player joined
        clearTimeout(this.reservedSeats[client.gottiId].timeout);
        delete this.reservedSeats[client.gottiId];
        // add a channelClient to client
        client.channelClient = new dist_2.Client(client.gottiId, this.masterChannel);
        // register channel/area message handlers
        this.registerClientAreaMessageHandling(client);
        this.clients.push(client);
        this.clientsById[client.gottiId] = client;
        console.log('onJoin was', this.onJoin);
        console.log('this was', this);
        let joinOptions = null;
        if (this.onJoin) {
            console.log('onJoin was', this.onJoin);
            joinOptions = this.onJoin(client, auth);
        }
        console.log('sending can join with area options', this.areaOptions);
        console.log('and joinOptions', joinOptions);
        Protocol_1.send(client, [10 /* JOIN_CONNECTOR */, this.areaOptions, joinOptions]);
        client.on('message', this._onWebClientMessage.bind(this, client));
        client.once('close', this._onLeave.bind(this, client));
    }
    async _onLeave(client, code) {
        // call abstract 'onLeave' method only if the client has been successfully accepted.
        if (Util_1.spliceOne(this.clients, this.clients.indexOf(client)) && this.onLeave) {
            delete this.clientsById[client.sessionId];
            // disconnect gotti client too.
            client.channelClient.unlinkChannel();
            await this.onLeave(client, (code === Protocol_1.WS_CLOSE_CONSENTED));
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
    _reserveSeat(clientId, auth) {
        this.reservedSeats[clientId] = {
            auth,
            timeout: setTimeout(() => {
                delete this.reservedSeats[clientId];
            }, 10000) // reserve seat for 10 seconds
        };
    }
    /**
     * Handles request from gate server, whatever this returns gets sent back to the gate server
     * to notify it if the reserve seat request went through or not.
     * @param data - data sent from gate server after play authenticated
     * @private
     */
    _requestJoin(data) {
        const auth = data[0];
        if (this.requestJoin(auth)) {
            const gottiId = Util_1.generateId();
            this._reserveSeat(gottiId, auth);
            // todo send host n port
            return { URL: this.port, gottiId };
        }
        else {
            return false;
        }
    }
    //TODO: maybe need to ping gate before?
    registerGateResponders() {
        this.responder.createResponse("2" /* HEARTBEAT */ + '-' + this.serverIndex, () => {
            return [this.serverIndex, this.clients.length];
        });
        this.responder.createResponse("1" /* RESERVE_PLAYER_SEAT */ + '-' + this.serverIndex, this._requestJoin.bind(this));
    }
}
exports.Connector = Connector;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)
class AreaRoom extends events_1.EventEmitter {
    constructor(gottiProcess, areaId, publicOptions) {
        super();
        this.patchRate = DEFAULT_PATCH_RATE;
        this.gameLoopRate = DEFAULT_PATCH_RATE;
        this.metadata = null;
        this.clientsById = {};
        this.gottiProcess = null;
        this.gottiProcess = gottiProcess;
        this.publicOptions = publicOptions;
        this.areaId = areaId;
        this.masterChannel = null;
        this.areaChannel = null;
        this.clientsById = {};
    }
    initializeChannels(masterChannel, areaChannel) {
        if (this.areaId !== areaChannel.channelId) {
            console.log('the area channel was', areaChannel.channelId);
            console.log('the area id was', this.areaId);
            throw 'Area Id and area channel id must be the same.';
        }
        this.areaChannel = areaChannel;
        this.masterChannel = masterChannel;
        this.registerBackChannelMessages();
        this.onInit && this.onInit();
    }
    _onInit(options) { }
    stopGame() {
        if (this.gottiProcess) {
            this.gottiProcess.stopAllSystems();
            this.gottiProcess.stopLoop();
        }
        else {
            throw new Error('No running gottiProcess');
        }
    }
    startGame() {
        if (this.gottiProcess) {
            this.gottiProcess.startAllSystems();
            this.gottiProcess.startLoop(this.gameLoopRate);
        }
        else {
            throw new Error('Process is invalid');
        }
    }
    requestWrite(clientId, areaId, options) {
        return true;
    }
    requestListen(clientId, options) {
        return true;
    }
    requestRemoveListen(clientId, options) {
        return true;
    }
    // dispatches local message to server systems from room
    addMessage(message) {
        this.gottiProcess.messageQueue.add(message);
    }
    addImmediateMessage(message, isRemote) {
        this.gottiProcess.messageQueue.instantDispatch(message);
    }
    setState(state) {
        if (!this.areaChannel) {
            throw 'Please make sure the area channel has a channel attached before setting state.';
        }
        if (!(this.gottiProcess)) {
            throw 'Make sure the process was created before setting state';
        }
        this.areaChannel.setState(state);
        this.state = this.areaChannel.state;
        // adds state to all system globals property.
        this.gottiProcess.addGlobal(state);
    }
    /**
     * sends system message to all clients in the game.
     * @param message
     */
    dispatchGlobalSystemMessage(message) {
        this.areaChannel.broadcast([28 /* SYSTEM_MESSAGE */, message]);
    }
    /**
     * sends system message to all clients who are listening to it
     * @param message
     */
    dispatchLocalSystemMessage(message) {
        this.areaChannel.broadcastLinked([28 /* SYSTEM_MESSAGE */, message]);
    }
    /**
     * sends system message to specific client.
     * @param client
     * @param message
     */
    dispatchClientSystemMessage(client, message) {
        this.masterChannel.messageClient(client.id, [28 /* SYSTEM_MESSAGE */, message.type, message.data, message.to, message.from]);
    }
    dispatchSystemMessageToAreas(areaIds, message) {
        this.areaChannel.sendMainFront([34 /* AREA_TO_AREA_SYSTEM_MESSAGE */, message.type, message.data, message.to, message.from, areaIds]);
    }
    /**
     * Tells the client that it should no longer be a listener to this room.
     * @param sessionId
     * @param options
     */
    removeClientListener(clientId, options) {
        delete this.clientsById[clientId];
        this.masterChannel.messageClient(clientId, [24 /* REQUEST_REMOVE_LISTEN_AREA */, this.areaId, options]);
    }
    ;
    /**
     * used if you want the area to notify a client that they
     * must listen to a new remote area.
     * @param clientId - id of the client on the connector server.
     * @param areaId - new area id the client is going to link to.
     * @param options - optional argument if you want to pass data between areas
     */
    addClientToArea(clientId, areaId, options) {
        this.clientsById[clientId] = {
            options,
        };
        this.masterChannel.messageClient(clientId, [21 /* REQUEST_LISTEN_AREA */, areaId, options]);
    }
    /**
     * sends a message to the client telling it that it should be using
     * this area room as its writer.
     * @param clientId - id of the client on the connector server.
     * @param options
     */
    setClientWrite(clientId, areaId, options) {
        this.clientsById[clientId].options = options;
        this.masterChannel.messageClient(clientId, [20 /* REQUEST_WRITE_AREA */, areaId, options]);
    }
    ;
    _onConnectorMessage() { }
    ;
    _onMessage(clientId, message) { }
    ;
    _onGlobalMessage(clientId, message) { }
    ;
    _onAddedAreaClientListen(clientId, options) {
        this.clientsById[clientId] = {
            id: clientId,
            options: options,
        };
        this.onListen && this.onListen(clientId, options);
    }
    ;
    _onRemovedAreaClientListen(clientId, options) {
        delete this.clientsById[clientId];
        this.onRemoveListen(clientId, options);
    }
    _onAddedAreaClientWrite(clientId, options) {
        this.clientsById[clientId].options = options;
        this.onWrite(clientId, options);
    }
    _onRemovedAreaClientWrite(clientId, options) {
        // dont remove since the client is still listening
        this.clientsById[clientId].options = options;
        this.onRemoveWrite(clientId, options);
    }
    _requestListen(clientId, options) {
        const requested = this.requestListen(clientId, options);
        if (requested) {
            this._onAddedAreaClientListen(clientId, options);
        }
        return requested;
    }
    registerBackChannelMessages() {
        this.areaChannel.onAddClientListen(this._requestListen.bind(this));
        this.areaChannel.onMessage((message) => {
            if (message[0] === 26 /* AREA_DATA */) {
                //    this.onMessage();
            }
            else if (message[0] === 34 /* AREA_TO_AREA_SYSTEM_MESSAGE */) {
                //  this.onMessage(message[1]);
            }
        });
        // get the add remote call reference from gottiProcess's message queue.
        const messageQueueRemoteDispatch = this.gottiProcess.messageQueue.addRemote.bind(this.gottiProcess.messageQueue);
        const messageQueueInstantRemoteDispatch = this.gottiProcess.messageQueue.instantDispatch.bind(this.gottiProcess.messageQueue);
        this.areaChannel.onClientMessage((clientId, message) => {
            if (message[0] === 26 /* AREA_DATA */) {
                //    this.onMessage();
            }
            else if (message[0] === 28 /* SYSTEM_MESSAGE */) {
                messageQueueRemoteDispatch(message[1], message[2], message[3], message[4]);
            }
            else if (message[0] === 29 /* IMMEDIATE_SYSTEM_MESSAGE */) {
                messageQueueInstantRemoteDispatch({ type: message[1], data: message[2], to: message[3], from: message[4] }, true);
            }
            else if (message[0] === 20 /* REQUEST_WRITE_AREA */) {
                // [protocol, areaId, options]
                const write = this.requestWrite(clientId, message[1], message[2]);
                if (write) {
                    this.setClientWrite(clientId, message[1], write);
                }
            }
            else if (message[0] === 24 /* REQUEST_REMOVE_LISTEN_AREA */) {
                const removed = this.requestRemoveListen(clientId, message[1]);
                if (removed) {
                    this.removeClientListener(clientId, removed);
                }
            }
        });
        this.areaChannel.onAddClientWrite.bind(this._onAddedAreaClientWrite.bind(this));
        this.areaChannel.onRemoveClientWrite.bind(this._onRemovedAreaClientWrite.bind(this));
        this.areaChannel.onAddClientListen.bind(this._onAddedAreaClientListen.bind(this));
        this.areaChannel.onRemoveClientListen.bind(this._onRemovedAreaClientListen.bind(this));
    }
}
exports.AreaRoom = AreaRoom;


import { BackChannel, BackMaster } from 'gotti-channels/dist';
import { Protocol } from './Protocol';

import * as fossilDelta from 'fossil-delta';
import * as msgpack from 'notepack.io';

import { EventEmitter } from 'events';

import { AreaClient as Client } from './AreaClient';
import { Presence } from 'colyseus/lib/presence/Presence';
import { RemoteClient } from 'colyseus/lib/presence/RemoteClient';

import { Deferred, logError, spliceOne } from 'colyseus/lib/Utils';

import * as jsonPatch from 'fast-json-patch'; // this is only used for debugging patches
import { debugAndPrintError, debugPatch, debugPatchData } from 'colyseus/lib/Debug';

const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)

export interface BroadcastOptions {
    except: Client;
}

export type SystemMessage = {
    type: number | string,
    data: any,
    to: Array<number | string>,
    from: number | string,
}

export type AreaToAreaSystemMessage = {
    type: number | string,
    data: any,
    to: Array<number | string>,
    from: number | string,
    toAreaIds: Array<number | string>,
}

export abstract class AreaRoom extends EventEmitter {
    public roomId: string;
    public roomName: string;

    readonly areaId: string | number;

    public patchRate: number = DEFAULT_PATCH_RATE;

    public areaChannel: BackChannel;
    public masterChannel: BackMaster;

    public metadata: any = null;

    public presence: Presence;

    public clientsById: any = {};

    private _patchInterval: NodeJS.Timer;

    constructor(areaId) {
        super();
        this.areaId = areaId;
        this.masterChannel = null;
        this.areaChannel = null;
        this.clientsById = {};
    }

    public initializeChannels(masterChannel, areaChannel) {
        if(this.areaId !== areaChannel.channelId) {
            throw 'Area Id and area channel id must be the same.'
        }
        this.areaChannel = areaChannel;
        this.masterChannel = masterChannel;
        this.registerBackChannelMessages();
    }

    public abstract onMessage(clientId: string, message) : void;
    //public abstract onGlobalMessage(message) : void;

    public onInit?(options: any): void;

    public onWrite?(clientId: string, options?: any): void;

    public requestWrite(clientId, areaId, options?) : any {
        return true;
    }

    public onRemoveWrite?(clientId: string, options?: any): void;

    public onListen?(clientId: string, options: any): void;
    public onRemoveListen?(clientId: string, options: any): void;

    public requestListen(clientId, options?) : any {
        return true;
    }

    public requestRemoveListen(clientId, options?) : any {
        return true;
    }

    public setState(newState) {
        this.areaChannel.setState(newState);
    }

    /**
     * sends system message to all clients in the game.
     * @param message
     */
    public dispatchGlobalSystemMessage(message: SystemMessage): void {
        this.areaChannel.broadcast([Protocol.SYSTEM_MESSAGE, message]);
    }

    /**
     * sends system message to all clients who are listening to it
     * @param message
     */
    public dispatchLocalSystemMessage(message) {
        this.areaChannel.broadcastLinked([Protocol.SYSTEM_MESSAGE, message])
    }

    /**
     * sends system message to specific client.
     * @param client
     * @param message
     */
    public dispatchClientSystemMessage(client: Client, message: SystemMessage) {
        this.masterChannel.messageClient(client.id, [Protocol.SYSTEM_MESSAGE, message.type, message.data, message.to, message.from]);
    }

    public dispatchSystemMessageToAreas(areaIds: Array<string>, message: SystemMessage) {
        this.areaChannel.sendMainFront([Protocol.AREA_TO_AREA_SYSTEM_MESSAGE, message.type, message.data, message.to, message.from, areaIds])
    }

    /**
     * Tells the client that it should no longer be a listener to this room.
     * @param sessionId
     * @param options
     */
    public removeClientListener(clientId, options?) {
        this.masterChannel.messageClient(clientId, [Protocol.REQUEST_REMOVE_LISTEN_AREA, this.areaId, options]);
    };

    /**
     * used if you want the area to notify a client that they
     * must listen to a new remote area.
     * @param clientId - id of the client on the connector server.
     * @param areaId - new area id the client is going to link to.
     * @param options - optional argument if you want to pass data between areas
     */
    public addClientToArea(clientId, areaId, options?) {
        this.clientsById[clientId] = {
            options,
        };
        this.masterChannel.messageClient(clientId, [Protocol.REQUEST_LISTEN_AREA, areaId, options]);
    }

    /**
     * sends a message to the client telling it that it should be using
     * this area room as its writer.
     * @param clientId - id of the client on the connector server.
     * @param options
     */
    public setClientWrite(clientId, areaId, options?) {
        this.clientsById[clientId].options = options;
        this.masterChannel.messageClient(clientId, [Protocol.REQUEST_WRITE_AREA, areaId, options]);
    };

    private _onConnectorMessage() {};
    private _onMessage(clientId, message) {};
    private _onGlobalMessage(clientId, message) {};

    private _onAddedAreaClientListen(clientId, options?) {
        this.clientsById[clientId] = {
            id: clientId,
            options: options,
        };
        this.onListen && this.onListen(clientId, options);
    };

    private _onRemovedAreaClientListen(clientId, options?) {
        delete this.clientsById[clientId];
        this.onRemoveListen(clientId, options);
    }

    private _onAddedAreaClientWrite(clientId, options?) {
        this.clientsById[clientId].options = options;
        this.onWrite(clientId, options);
    }

    private _onRemovedAreaClientWrite(clientId, options?) {
        // dont remove since the client is still listening
        this.clientsById[clientId].options = options;
        this.onRemoveWrite(clientId, options);
    }

    private _requestListen(clientId, options) {
        const requested = this.requestListen(clientId, options);
        if(requested) {
            this._onAddedAreaClientListen(clientId, options);
        }
        return requested;
    }

    private registerBackChannelMessages() {
        this.areaChannel.onAddClientListen(this._requestListen.bind(this));

        this.areaChannel.onMessage((message) => {
            if (message[0] === Protocol.AREA_DATA) {
                //    this.onMessage();
            } else if (message[0] === Protocol.AREA_TO_AREA_SYSTEM_MESSAGE) {
              //  this.onMessage(message[1]);
            }
        });

        this.areaChannel.onClientMessage((clientId, message) => {
            if (message[0] === Protocol.AREA_DATA) {
                //    this.onMessage();
            } else if (message[0] === Protocol.SYSTEM_MESSAGE) {
                //  this.onMessage(message[1]);
            } else if (message[0] === Protocol.REQUEST_WRITE_AREA) {
                // [protocol, requestedId, options]
                const write = this.requestWrite(clientId, message[1], message[2]);
                if(write) {
                    this.setClientWrite(clientId, write);
                }
            } else if (message[0] === Protocol.REQUEST_REMOVE_LISTEN_AREA) {
                const removed = this.requestRemoveListen(clientId, message[1]);
                if(removed) {
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

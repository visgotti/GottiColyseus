/// <reference types="node" />
import { BackChannel, BackMaster } from 'gotti-channels/dist';
import { EventEmitter } from 'events';
import { AreaClient as Client } from './AreaClient';
export interface BroadcastOptions {
    except: Client;
}
export declare type SystemMessage = {
    type: number | string;
    data: any;
    to: Array<number | string>;
    from: number | string;
};
export declare type AreaToAreaSystemMessage = {
    type: number | string;
    data: any;
    to: Array<number | string>;
    from: number | string;
    toAreaIds: Array<number | string>;
};
export declare abstract class AreaRoom extends EventEmitter {
    roomId: string;
    roomName: string;
    publicOptions: any;
    readonly areaId: string | number;
    patchRate: number;
    areaChannel: BackChannel;
    masterChannel: BackMaster;
    metadata: any;
    clientsById: any;
    private _patchInterval;
    constructor(areaId: any, publicOptions?: any);
    initializeChannels(masterChannel: any, areaChannel: any): void;
    abstract onMessage(clientId: string, message: any): void;
    onInit?(options: any): void;
    onWrite?(clientId: string, options?: any): void;
    requestWrite(clientId: any, areaId: any, options?: any): any;
    onRemoveWrite?(clientId: string, options?: any): void;
    onListen?(clientId: string, options: any): void;
    onRemoveListen?(clientId: string, options: any): void;
    requestListen(clientId: any, options?: any): any;
    requestRemoveListen(clientId: any, options?: any): any;
    setState(newState: any): void;
    /**
     * sends system message to all clients in the game.
     * @param message
     */
    dispatchGlobalSystemMessage(message: SystemMessage): void;
    /**
     * sends system message to all clients who are listening to it
     * @param message
     */
    dispatchLocalSystemMessage(message: any): void;
    /**
     * sends system message to specific client.
     * @param client
     * @param message
     */
    dispatchClientSystemMessage(client: Client, message: SystemMessage): void;
    dispatchSystemMessageToAreas(areaIds: Array<string>, message: SystemMessage): void;
    /**
     * Tells the client that it should no longer be a listener to this room.
     * @param sessionId
     * @param options
     */
    removeClientListener(clientId: any, options?: any): void;
    /**
     * used if you want the area to notify a client that they
     * must listen to a new remote area.
     * @param clientId - id of the client on the connector server.
     * @param areaId - new area id the client is going to link to.
     * @param options - optional argument if you want to pass data between areas
     */
    addClientToArea(clientId: any, areaId: any, options?: any): void;
    /**
     * sends a message to the client telling it that it should be using
     * this area room as its writer.
     * @param clientId - id of the client on the connector server.
     * @param options
     */
    setClientWrite(clientId: any, areaId: any, options?: any): void;
    private _onConnectorMessage;
    private _onMessage;
    private _onGlobalMessage;
    private _onAddedAreaClientListen;
    private _onRemovedAreaClientListen;
    private _onAddedAreaClientWrite;
    private _onRemovedAreaClientWrite;
    private _requestListen;
    private registerBackChannelMessages;
}

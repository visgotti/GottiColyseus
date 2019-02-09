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
/// <reference types="node" />
import { ServerOptions as IServerOptions } from 'ws';
import { FrontMaster } from 'gotti-channels/dist';
import { EventEmitter } from 'events';
import { ConnectorClient as Client } from './ConnectorClient';
export declare type SimulationCallback = (deltaTime?: number) => void;
export declare type ConnectorOptions = IServerOptions & {
    pingTimeout?: number;
    gracefullyShutdown?: boolean;
    server: string;
    port?: number;
    serverIndex: number;
    connectorURI: string;
    gateURI: string;
    areaRoomIds: Array<string>;
    areaServerURIs: Array<string>;
};
export interface RoomAvailable {
    clients: number;
    maxClients: number;
    metadata?: any;
}
export interface BroadcastOptions {
    except: Client;
}
export declare abstract class Connector extends EventEmitter {
    protected httpServer: any;
    areaOptions: {
        [areaId: string]: any;
    };
    options: ConnectorOptions;
    serverIndex: number;
    connectorURI: string;
    areaRoomIds: Array<string>;
    areaServerURIs: Array<string>;
    port: number;
    roomName: string;
    maxClients: number;
    patchRate: number;
    autoDispose: boolean;
    state: any;
    metadata: any;
    masterChannel: FrontMaster;
    channels: any;
    clients: Client[];
    clientsById: {
        [sessionId: string]: Client;
    };
    private _patchInterval;
    private server;
    private gateURI;
    private responder;
    private reservedSeats;
    constructor(options: ConnectorOptions);
    protected onConnection: (client: any, req: any) => void;
    connectToAreas(): Promise<boolean>;
    abstract onMessage(client: Client, message: any): void;
    onAddedAreaListen?(client: any, areaId: string, options?: any): void | Promise<any>;
    onRemovedAreaListen?(client: any, areaId: string, options?: any): void | Promise<any>;
    onChangedAreaWrite?(client: any, newAreaId: string, oldAreaId?: string): void | Promise<any>;
    onInit?(options: any): void;
    onJoin?(client: Client, auth: any): any | Promise<any>;
    onLeave?(client: Client, consented?: boolean): void | Promise<any>;
    onDispose?(): void | Promise<any>;
    onAuth?(options: any): boolean;
    /**
     * @param clientId - id client authenticated from gate server as
     * @param auth - authentication data sent from Gate server.
     * @returns {number}
     */
    requestJoin(auth: any): number | boolean;
    send(client: Client, data: any): void;
    disconnect(closeHttp?: boolean): Promise<boolean>;
    protected broadcast(data: any, options?: BroadcastOptions): boolean;
    private _onAreaMessages;
    private registerClientAreaMessageHandling;
    private registerAreaMessages;
    private _onAreaMessage;
    private _onWebClientMessage;
    private addAreaListen;
    /**
     *
     * @param client
     * @param newAreaId - new area id that will become the writer
     * @param writeOptions - options that get sent with the new write client notification to the new area
     * @returns {boolean}
     */
    private changeAreaWrite;
    private removeAreaListen;
    /**
     * Used for validating user requested area changes.
     * if provided, options get sent to area and will
     * return asynchronously with response options from area
     * or a boolean indicating success
     */
    private _requestAreaListen;
    private _requestRemoveAreaListen;
    private _requestAreaWrite;
    private _onJoin;
    private _onLeave;
    /**
     * reserves seat till player joins
     * @param clientId - id of player to reserve seat for
     * @param auth - data player authenticated with on gate.
     * @private
     */
    private _reserveSeat;
    /**
     * Handles request from gate server, whatever this returns gets sent back to the gate server
     * to notify it if the reserve seat request went through or not.
     * @param data - data sent from gate server after play authenticated
     * @private
     */
    private _requestJoin;
    private registerGateResponders;
}

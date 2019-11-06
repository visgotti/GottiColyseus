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
    messageRelayRate?: number;
    serverIndex: number;
    connectorURI: string;
    gateURI: string;
    masterServerURI?: string;
    areaRoomIds: Array<string>;
    areaServerURIs: Array<string>;
    relayURI?: string;
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
    private relayChannel?;
    private masterServerChannel?;
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
        [gottiId: string]: Client;
    };
    private _patchInterval;
    private _relayMessageTimeout;
    private server;
    private gateURI;
    private masterServerURI;
    private relayURI;
    private responder;
    private reservedSeats;
    private messageRelayRate;
    constructor(options: ConnectorOptions);
    protected setMessageRelayRate(rate: number): void;
    protected startMessageRelay(): void;
    protected stopMessageRelay(): void;
    private relayMessages;
    protected onConnection: (client: any, req: any) => void;
    connectToAreas(): Promise<boolean>;
    abstract onMessage(client: Client, message: any): void;
    onInit?(options: any): void;
    onMasterMessage?(message: any): void;
    onJoin?(client: Client): any | Promise<any>;
    onLeave?(client: Client, consented?: boolean): void | Promise<any>;
    onDispose?(): void | Promise<any>;
    /**
     * @param auth - authentication data sent from Gate server.
     * @param joinOptions - additional options that may have sent from gate server, you can add/remove properties
     * to it in request join and it will persist onto the client object.
     * @returns {number}
     */
    requestJoin(auth: any, joinOptions: any): number | boolean;
    getClientDataByGottiId(gottiId: any): {
        auth: any;
        joinOptions: any;
    };
    disconnect(closeHttp?: boolean): Promise<boolean>;
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
    abstract getInitialWriteArea(client: Client, areaOptions: any, clientOptions?: any): {
        areaId: string;
        options: any;
    };
    protected broadcast(data: any, options?: BroadcastOptions): boolean;
    private registerClientAreaMessageHandling;
    private registerChannelMessages;
    private registerMasterServerMessages;
    private registerRelayMessages;
    private registerAreaMessages;
    private _getInitialWriteArea;
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
    private _onJoin;
    private _onLeave;
    /**
     * reserves seat till player joins
     * @param clientId - id of player to reserve seat for
     * @param auth - data player authenticated with on gate.
     * @param joinOptions - additional data sent from the gate
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

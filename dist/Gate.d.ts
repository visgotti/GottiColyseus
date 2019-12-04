export interface ConnectorData {
    proxyId: string;
    host: string;
    port: number;
    serverIndex: number;
    connectedClients: number;
    gameId: string;
    heartbeat?: Function;
    reserveSeat?: Function;
}
/**
 * @param availableGames - map of games by id of a certain type
 * @param auth - user authentication data
 * @param clientOptions - additional options client may have passed in game request
 */
export declare type MatchMakerFunction = (availableGames: any, auth: any, clientOptions?: any) => {
    gameId: string;
    joinOptions: any;
};
export interface GameData {
    connectorsData: Array<ConnectorData>;
    id: string;
    type: string;
    region?: string;
    publicOptions?: any;
    options?: any;
    gameData?: any;
    areaData?: any;
}
export interface GateConfig {
    gateURI: string;
    gamesData: Array<GameData>;
}
export declare type ClientConnectorLookup = Map<string, number>;
export declare class Gate {
    urls: any[];
    private _authenticationHandler;
    private connectorsByServerIndex;
    private connectedClients;
    private pendingClients;
    private gamesById;
    private requestBroker;
    private requester;
    private responder;
    readonly redisURI: string;
    private availableGamesByType;
    private unavailableGamesById;
    private matchMakersByGameType;
    private playerIndex;
    private authMap;
    private heartbeat;
    private authTimeout;
    private makeGameAvailable;
    private makeGameUnavailable;
    private _publicGateData;
    private publicGateDataChanged;
    constructor(gateURI: any, redisURI?: any);
    getPlayerAuth(authId: any): Promise<any>;
    onAuthentication(onAuthHandler: any): void;
    authenticationHandler(req: any, res: any): void;
    defineMatchMaker(gameType: any, MatchMakerFunction: any): void;
    private createHeartbeatForConnector;
    private createReserveSeatForConnector;
    private reserveSeat;
    addGame(connectorsData: Array<{
        serverIndex: number;
        host: string;
        port: number;
        proxyId: string;
    }>, gameType: any, gameId: any, gameData: any, areaData: any): void;
    private addConnector;
    /**
     * Handles the request from a player for a certain game type. needs work
     * right now the reuest has gameId and then the gate server will
     * reserve a seat on a connector from the game with fewest connected clients
     * @param req
     * @param res
     * @returns {Response|undefined}
     */
    gameRequested(req: any, res: any): Promise<any>;
    /**
     *
     * @param gameType - type of game requested
     * @param auth - user authentication data
     * @param clientJoinOptions - additional data about game request sent from client
     * @returns {{host, port, gottiId}}
     */
    private matchMake;
    readonly publicGateData: any;
    private makePublicGateData;
    gateKeep(req: any, res: any): Promise<any>;
    registerGateKeep(handler: (request: any, response: any) => any): void;
    private onGateKeepHandler;
    private validateGameRequest;
    private getLeastPopulatedConnector;
    /**
     *
     * @param serverIndex
     * @param auth
     * @param joinOptions
     * @returns {{host, port, gottiId, playerIndex }}
     */
    private addPlayerToConnector;
    /**
     * Removes a player from the connector's count and then resorts the pool
     * @param serverIndex - server index that the connector lives on.
     */
    private removePlayerFromConnector;
    startConnectorHeartbeat(interval?: number): void;
    stopConnectorHeartbeat(): void;
    private handleHeartbeatError;
    private handleHeartbeatResponse;
    private registerAuthResponders;
    getConnectorsByGameId(gameId: any): ConnectorData[];
    getAuths(ids?: any): {};
    private getClientCountOnConnector;
    private getGameIdOfConnector;
    private disconnect;
}

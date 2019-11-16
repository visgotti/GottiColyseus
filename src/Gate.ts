import { Messenger, Broker } from 'gotti-reqres/dist';
import { GateProtocol, GOTTI_GATE_CHANNEL_PREFIX, GOTTI_GET_GAMES_OPTIONS, GOTTI_GATE_AUTH_ID } from './Protocol';
import { sortByProperty, generateId } from './Util';

export interface ConnectorData {
    host: string,
    port: number,
    serverIndex: number,
    connectedClients: number,
    gameId: string;
    heartbeat?: Function;
    reserveSeat?: Function;
}

/**
 * @param availableGames - map of games by id of a certain type
 * @param auth - user authentication data
 * @param clientOptions - additional options client may have passed in game request
 */
export type MatchMakerFunction = (availableGames: any, auth: any, clientOptions?: any) => { gameId: string, joinOptions: any };

export interface GameData {
    connectorsData: Array<ConnectorData>;
    id: string,
    type: string,
    region?: string,
    publicOptions?: any,
    options?: any,
    gameData?: any,
    areaData?: any,
}

export interface GateConfig {
    gateURI: string,
    gamesData: Array<GameData>,
}

export type ClientConnectorLookup = Map<string, number>;

export class Gate {
    public urls = [];

    private _authenticationHandler: Function;

    private connectorsByServerIndex: { [serverIndex: number]: ConnectorData } = {};

    // used for reconnections
    private connectedClients: ClientConnectorLookup = new Map();
    private pendingClients: ClientConnectorLookup = new Map();

    private gamesById: { [id: string]: GameData} = {};

    private requestBroker: Broker;
    private requester: Messenger;
    private responder: Messenger;

    readonly redisURI: string;

    private availableGamesByType: { [type: string]: {[id: string]: GameData } } = {};
    private unavailableGamesById: { [id: string]: GameData } = {};
    private matchMakersByGameType: Map<string, any> = new Map();

    private playerIndex: number = 0;

    private authMap: Map<string, any> = new Map();

    private heartbeat: NodeJS.Timer = null;

    private authTimeout: number = 1000 * 60 * 60 * 12; // 12 hours

    private makeGameAvailable(gameId: string) : boolean {
        if(gameId in this.unavailableGamesById) {
            const gameData = this.unavailableGamesById[gameId];
            this.availableGamesByType[gameData.type][gameId] = gameData;
            this.publicGateDataChanged = true;
            delete this.unavailableGamesById[gameId];
            return true;
        }
    }

    private makeGameUnavailable(gameId: string) {
        const gameData = this.gamesById[gameId];
        if(gameData && this.availableGamesByType[gameData.type] && this.availableGamesByType[gameData.type][gameId]) {
            this.unavailableGamesById[gameId] = gameData;
            delete this.availableGamesByType[gameData.type][gameId];
            this.publicGateDataChanged = true;
            return true;
        }
        return false;
    }

    private _publicGateData: any = {};
    private publicGateDataChanged = true;

    constructor(gateURI, redisURI?) {
        this.gateKeep = this.gateKeep.bind(this);
        this.gameRequested = this.gameRequested.bind(this);
        this.requestBroker = new Broker(gateURI, 'gate');

        this.requester = new Messenger({
            id: 'gate_requester',
            brokerURI: gateURI,
            request: { timeout: 1000 }
        });

        this.responder = new Messenger({
            id: 'gate_responder',
            brokerURI: gateURI,
            response: true
        })

        this.registerAuthResponders();

        //TODO: initialize subscriber socket
    }

    public async getPlayerAuth(authId) {
        const auth = this.authMap.get(authId);
        if(auth) return auth.auth;
        return null;
    }

    public onAuthentication(onAuthHandler) {
        this._authenticationHandler = onAuthHandler.bind(this);
    }

    public authenticationHandler(req, res) {

    }

    public defineMatchMaker(gameType, MatchMakerFunction) {
        if(!(this.availableGamesByType[gameType])) {
            throw new Error(`trying to define a match maker for unavaibale gameType ${gameType}`)
        }
        this.matchMakersByGameType.set(gameType, MatchMakerFunction);
    }

    private createHeartbeatForConnector(connectorServerIndex) {
        let reqName = GateProtocol.HEARTBEAT + '-' + connectorServerIndex;
        this.requester.createRequest(reqName, `${connectorServerIndex}_responder`,);
        return this.requester.requests[reqName].bind(this);
    }

    private createReserveSeatForConnector(connectorServerIndex) {
        let reqName = GateProtocol.RESERVE_PLAYER_SEAT + '-' + connectorServerIndex;
        this.requester.createRequest(reqName, `${connectorServerIndex}_responder`,);
        return this.requester.requests[reqName].bind(this);
    }

    private async reserveSeat(connectorServerIndex, auth, clientJoinOptions): Promise<any> {
        const tempId = generateId();

        this.playerIndex++;
        if(this.playerIndex > 65535) {
            this.playerIndex = 0;
        }
        const playerIndex = this.playerIndex;

        try {
            this.pendingClients[tempId] = auth;

            let result = await this.connectorsByServerIndex[connectorServerIndex].reserveSeat({ auth, playerIndex, joinOptions: clientJoinOptions });

            if(result && result.gottiId) {
                this.pendingClients.delete(tempId);
                this.connectedClients.set(result.gottiId, connectorServerIndex);
                const { host, port } = this.connectorsByServerIndex[connectorServerIndex];
                return {
                    gottiId: result.gottiId,
                    playerIndex,
                    host,
                    port,
                }
            } else {
                this.pendingClients.delete(tempId);
                throw new Error('Invalid response from connector room. Failed to connect.');
            }
        } catch(err) {
            this.pendingClients.delete(tempId);
            throw err;
        }
    }

    // TODO: refactor this and adding games
    public addGame(connectorsData: Array<{serverIndex: number, host: string, port: number }>, gameType, gameId, gameData: any, areaData: any) {

        if(gameId in this.gamesById) {
            throw `gameId: ${gameId} is being added for a second time. The first reference was ${this.gamesById[gameId]}`
        }

        const gameConnectorsData = [];

        connectorsData.forEach((data) => {
            const { serverIndex, host, port } = data;
            gameConnectorsData.push(this.addConnector(host, port, serverIndex, gameId));
        });

        this.gamesById[gameId] = {
            id: gameId,
            type: gameType,
            connectorsData: gameConnectorsData,
            areaData,
            gameData
        };

        if(!(gameType in this.availableGamesByType)) {
            this.availableGamesByType[gameType] = {};
        }
        this.availableGamesByType[gameType][gameId] = this.gamesById[gameId];
        this.publicGateDataChanged = true;
    }

    private addConnector(host, port, serverIndex, gameId) : ConnectorData {

        const formatError = () => { return `error when adding connector SERVER_INDEX#: ${serverIndex}, host: ${host}, port: ${port} game ID:${gameId}`; };

        if(serverIndex in this.connectorsByServerIndex) {
            throw new Error(`${formatError()} because server index is already in connectors`);
        }

        for(let serverIndex in this.connectorsByServerIndex) {
            if(this.connectorsByServerIndex[serverIndex].host === host && this.connectorsByServerIndex[serverIndex].port === port) {
                throw new Error(`${formatError()} because another connector already has the host and port`);
            }
        }

        this.connectorsByServerIndex[serverIndex] = {
            host,
            port,
            serverIndex,
            connectedClients: 0,
            heartbeat: this.createHeartbeatForConnector(serverIndex),
            reserveSeat: this.createReserveSeatForConnector(serverIndex),
            gameId,
        };

        return this.connectorsByServerIndex[serverIndex];
    }

    /**
     * Handles the request from a player for a certain game type. needs work
     * right now the reuest has gameId and then the gate server will
     * reserve a seat on a connector from the game with fewest connected clients
     * @param req
     * @param res
     * @returns {Response|undefined}
     */
    public async gameRequested(req, res) {
        const authId = req.body[GOTTI_GATE_AUTH_ID];
        if(!authId) {
            return res.status(401).json({ error: 'Error with authentication' });
        }
        const clientAuth = await this.getPlayerAuth(authId);

        if(!clientAuth) {
            return res.status(401).json({ error: 'Error with authentication' });
        }
        const clientOptions = req.body[GOTTI_GET_GAMES_OPTIONS];
        const validated = this.validateGameRequest(req);

        if(validated.error) {
            return res.status(validated.code).json(validated.error);
        }

        const { gameType } = validated;

        const { host, port, gottiId, playerIndex, gameData, areaData } = await this.matchMake(gameType, clientAuth, clientOptions, req);

        if(host && port) {
            return res.status(200).json({ host, port, gottiId, playerIndex, clientId: playerIndex, gameData, areaData });
        } else {
            return res.status(500).json('Invalid request');
        }
    }

    /**
     *
     * @param gameType - type of game requested
     * @param auth - user authentication data
     * @param clientJoinOptions - additional data about game request sent from client
     * @returns {{host, port, gottiId}}
     */
    private async matchMake(gameType, auth, clientJoinOptions, req) : Promise<any> {
        try {
            const definedMatchMaker = this.matchMakersByGameType.get(gameType);

            if(!(definedMatchMaker)) {
                throw `No matchmaking for ${gameType}`;
            }

            const availableGames = this.availableGamesByType[gameType];

            const gameId = definedMatchMaker(availableGames, auth, clientJoinOptions, req);
            if(!gameId) throw 'Failed to find game.';
            if(!(gameId in this.gamesById)) throw `match maker gave gameId: ${gameId} which is not a valid game id.`;

            const connectorData = this.gamesById[gameId].connectorsData[0]; // always sorted;

            const { host, port, gottiId, playerIndex, joinOptions } = await this.addPlayerToConnector(connectorData.serverIndex, auth, clientJoinOptions);
            const { gameData, areaData } = this.gamesById[gameId];
            return { host, port, gottiId, playerIndex, joinOptions, gameData, areaData  };
        } catch (err) {
            throw err;
        }
    }

    get publicGateData() {
        if(this.publicGateDataChanged) {
            this._publicGateData = this.makePublicGateData();
            this.publicGateDataChanged = false;
        }
        return this._publicGateData;
    }

    private makePublicGateData() {
        let availableData = {};
        for(let key in this.availableGamesByType) {
            availableData[key] = {};
            for(let id in this.availableGamesByType[key]) {
                availableData[key][id] = {
                    options: this.availableGamesByType[key][id].publicOptions,
                }
            }
        }
        return availableData;
    }

    public async gateKeep(req, res) {
        const clientOptions = req.body[GOTTI_GET_GAMES_OPTIONS];
        const authId = req.body[GOTTI_GATE_AUTH_ID];
        if(!authId) {
            return res.status(401).json('Error with authentication')
        }
        const clientAuth = await this.getPlayerAuth(authId);
        if(!clientAuth) {
            return res.status(401).json('Error with authentication')
        }
        try {
            const returnOptions = await this.onGateKeepHandler(clientOptions, this.publicGateData, clientAuth, req);
            if(returnOptions) {
                return res.status(200).json(returnOptions);
            } else {
                return res.status(401).json('Error authenticating');
            }
        } catch(err) {
            let errMsg = err.message ? err.message : "Error authenticating";
            return res.status(401).json(errMsg);
        }
    }

    public registerGateKeep(handler: (request, response) => any) {
        this.onGateKeepHandler = handler;
        this.onGateKeepHandler = this.onGateKeepHandler.bind(this);
    }

    private onGateKeepHandler(availableGames, auth, clientOptions, req) : any {
        console.warn('Currently always returning true for your gateKeep function, please specify a gateKeep(req,res) handler in Gate.js for custom gate keeping.')
        return availableGames
    }

    private validateGameRequest(req) : any {
        if(!(req.body) || !(req.body['gameType'] || !(req.body['gameType'] in this.availableGamesByType))) {
            return { error: 'Bad request', code: 400 }
        }
        return { gameType: req.body.gameType  };
    }

    // gets connector for game type
    private getLeastPopulatedConnector(gameId) {
        const { connectorsData } = this.gamesById[gameId];
        const connectorData = connectorsData[0];
    }

    /**
     *
     * @param serverIndex
     * @param auth
     * @param joinOptions
     * @returns {{host, port, gottiId, playerIndex }}
     */
    private async addPlayerToConnector(serverIndex, auth?, clientJoinOptions?) : Promise<any> {
        const connectorData = this.connectorsByServerIndex[serverIndex];
        try {
            const { host, port, gottiId, playerIndex } = await this.reserveSeat(serverIndex, auth, clientJoinOptions);
            connectorData.connectedClients++;
            //sorts
            this.gamesById[connectorData.gameId].connectorsData.sort(sortByProperty('connectedClients'));
            return { host, port, gottiId, playerIndex } ;
        } catch(err) {
            throw err;
        }
    }

    /**
     * Removes a player from the connector's count and then resorts the pool
     * @param serverIndex - server index that the connector lives on.
     */
    private removePlayerFromConnector(serverIndex) {
        const connectorData = this.connectorsByServerIndex[serverIndex];
        connectorData.connectedClients--;

        //sorts
        this.gamesById[connectorData.gameId].connectorsData.sort(sortByProperty('connectedClients'))
    }


    public startConnectorHeartbeat(interval=100000) {
        if(this.heartbeat) {
            this.stopConnectorHeartbeat();
        }
        this.heartbeat = setInterval(async() => {
            const heartbeats = Object.keys(this.connectorsByServerIndex).map(key => {
                return this.connectorsByServerIndex[key].heartbeat(1);
            });

            // https://stackoverflow.com/questions/31424561/wait-until-all-es6-promises-complete-even-rejected-promises/36115549#36115549

            Promise.all(heartbeats.map(hb => hb.catch(e => e)))
                .then(results => {
                    let resLen = results.length;
                    while (resLen--) {
                        if (!(results[resLen].error)) {
                        } else {
                            this.handleHeartbeatResponse(results[resLen]);
                        }
                    }
                })
        }, interval);
    }

    public stopConnectorHeartbeat() {
        clearTimeout(this.heartbeat);
    }

    private handleHeartbeatError(connector) {
    }

    private handleHeartbeatResponse(response) {
        const connectorData = this.connectorsByServerIndex[response[0]];
        if(connectorData.connectedClients !== response[1]) {
            console.warn('the connected clients on gate did not match the count on the connector ', connectorData);
            connectorData.connectedClients = response[1];
            this.gamesById[connectorData.gameId].connectorsData.sort(sortByProperty('connectedClients'))
        }
    }

    /*
    private formatGamesData(gamesData: Array<GameData>) : any {
        let gamesByType: any = {};
        let gamesById: any = {};
        let connectorsByServerIndex: any = {};

        let availableGamesByType = {};

        gamesData.forEach(g => {
            if(!(g.type in gamesByType)) {
                gamesByType[g.type] = [];
                availableGamesByType[g.type] = [];
            }
            if(g.id in gamesById) {
                throw new Error(`Multiple games with the same id: ${g.id}`);
            }

            availableGamesByType[g.type].push(g.id);
            gamesById[g.id] = g;
            gamesByType[g.type].push(g);

            g.connectorsData.forEach(c => {
                if(c.serverIndex in connectorsByServerIndex) {
                    throw new Error(`different games ${ connectorsByServerIndex[c.serverIndex].gameId } and ${g.id} are using the same connector ${c.serverIndex}`)
                }
                connectorsByServerIndex[c.serverIndex] = c;
            });
        });

        return  { gamesById, gamesByType, connectorsByServerIndex, availableGamesByType }
    }
    */

    private registerAuthResponders() {
        this.responder.createResponse(GOTTI_GATE_CHANNEL_PREFIX + '-' + GateProtocol.RESERVE_AUTHENTICATION, (data) => {
            const { auth, oldAuthId, refresh } = data;
            const timeout = data.timeout ? data.timeout : this.authTimeout;
            let old = null;
            if(oldAuthId) {
                old = this.authMap.get(oldAuthId);
                if(old) {
                    clearTimeout(old.timeout);
                    this.authMap.delete(oldAuthId);
                }
            }

            // trying to refresh an old auth that didnt exist. return early with false.
            if(refresh && !old) {
                return false;
            }
            const newAuthKey = generateId(9);
            if(refresh) {
                this.authMap.set(newAuthKey, {
                    auth: old.auth,
                    timeout: setTimeout(() => {
                        this.authMap.delete(newAuthKey);
                    }, timeout)
                })
            } else {
                this.authMap.set(newAuthKey, {
                    auth,
                    timeout: setTimeout(() => {
                        this.authMap.delete(newAuthKey);
                    }, timeout)
                })
            }

            return newAuthKey
        });
    }

    public getConnectorsByGameId(gameId) {
        return this.gamesById[gameId] ? this.gamesById[gameId].connectorsData : null;
    }

    public getAuths(ids?) {
        if(ids === undefined || ids === null) {
            ids = Object.keys(this.authMap);
        } else {
            ids = Array.isArray(ids) ? ids : [ids]
        }
        const requestedAuthMap = {};
        let foundAuths = 0;
        for(let i = 0; i < ids.length; i++) {
            const auth = this.authMap.get(ids[i]);
            if(auth) {
                foundAuths++;
                requestedAuthMap[ids[i]] = auth.auth;
            }
        }
        if(foundAuths) {
            return requestedAuthMap
        } else {
            return null;
        }
    }

    private getClientCountOnConnector(serverIndex) {
        return this.connectorsByServerIndex[serverIndex].connectedClients;
    }

    private getGameIdOfConnector(serverIndex) {
        return this.connectorsByServerIndex[serverIndex].gameId;
    }

    private disconnect() {
        if(this.requester) {
            this.requester.close();
            this.requestBroker.close();
        }
        if(this.responder) {
            this.responder.close();
        }
    }
}
import { Messenger as Requester, Broker } from 'gotti-reqres/dist';
import { GateProtocol } from './Protocol';
import { sortByProperty, generateId } from './Util';

export interface ConnectorData {
    URL: string,
    serverIndex: number,
    connectedClients: number,
    gameId: string;
    heartbeat?: Function;
    reserveSeat?: Function;
}

export type MatchMakerFunction = (availableGames: any, auth: any, options?: any) => { gameId: string, seatOptions: any };

export interface GameData {
    connectorsData: Array<ConnectorData>;
    id: string,
    type: string,
    region?: string,
    publicOptions?: any,
    options?: any,
}

export interface GateConfig {
    gateURI: string,
    gamesData: Array<GameData>,
}

export type ClientConnectorLookup = Map<string, number>;

export class Gate {
    public urls = [];
    private connectorsByServerIndex: { [serverIndex: number]: ConnectorData } = {};

    // used for reconnections
    private connectedClients: ClientConnectorLookup = new Map();
    private pendingClients: ClientConnectorLookup = new Map();

    private gamesById: { [id: string]: GameData} = {};

    private requestBroker: Broker;
    private requester: Requester;

    private availableGamesByType: { [type: string]: {[id: string]: GameData } } = {};
    private unavailableGamesById: { [id: string]: GameData } = {};
    private matchMakersByGameType: Map<string, any> = new Map();

    private heartbeat: NodeJS.Timer = null;

    private makeGameAvailable(gameId: string) : boolean {
        if(gameId in this.unavailableGamesById) {
            const gameData = this.unavailableGamesById[gameId];
            this.availableGamesByType[gameData.type][gameId] = gameData;
            delete this.unavailableGamesById[gameId];
            return true;
        }
    }

    private makeGameUnavailable(gameId: string) {
        const gameData = this.gamesById[gameId];
        if(gameData && this.availableGamesByType[gameData.type] && this.availableGamesByType[gameData.type][gameId]) {
            this.unavailableGamesById[gameId] = gameData;
            delete this.availableGamesByType[gameData.type][gameId];
            return true;
        }
        return false;
    }

    constructor(gateURI) {
        this.gateKeep = this.gateKeep.bind(this);
        this.gameRequested = this.gameRequested.bind(this);
        this.requestBroker = new Broker(gateURI, 'gate');

        this.requester = new Requester({
            id: 'gate_requester',
            brokerURI: gateURI,
            request: { timeout: 1000 }
        });
        //TODO: initialize subscriber socket
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

    private async reserveSeat(connectorServerIndex, auth, seatOptions): Promise<any> {
        const tempId = generateId();
        try {
            this.pendingClients[tempId] = auth;

            let result = await this.connectorsByServerIndex[connectorServerIndex].reserveSeat({ auth, seatOptions });

            if(result && result.gottiId &&  result.serverIndex === connectorServerIndex) {
                this.pendingClients.delete(tempId);
                this.connectedClients.set(result.gottiId, result.serverIndex);
                return {
                    gottiId: result.gottiId,
                    URL: this.connectorsByServerIndex[result.serverIndex].URL
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
    public addGame(connectorsData: Array<{serverIndex: number, URL: string }>, gameType, gameId, publicOptions?: any) {

        if(gameId in this.gamesById) {
            throw `gameId: ${gameId} is being added for a second time. The first reference was ${this.gamesById[gameId]}`
        }

        const gameConnectorsData = [];

        connectorsData.forEach((data) => {
            const { serverIndex, URL } = data;
            gameConnectorsData.push(this.addConnector(URL, serverIndex, gameId));
        });

        this.gamesById[gameId] = {
            id: gameType,
            type: gameType,
            connectorsData: gameConnectorsData,
            publicOptions,
        };

        if(!(gameType in this.availableGamesByType)) {
            this.availableGamesByType[gameType] = {};
        }
        this.availableGamesByType[gameType][gameId] = this.gamesById[gameId];
    }


    private addConnector(URL, serverIndex, gameId) : ConnectorData {

        const formatError = () => { return `error when adding connector SERVER_INDEX#: ${serverIndex}, URL: ${URL}, game ID:${gameId}`; };

        if(serverIndex in this.connectorsByServerIndex) {
            throw new Error(`${formatError()} because server index is already in connectors`);
        }

        for(let serverIndex in this.connectorsByServerIndex) {
            if(this.connectorsByServerIndex[serverIndex].URL === URL) {
                throw new Error(`${formatError()} because another connector already has URL`);
            }
        }

        this.connectorsByServerIndex[serverIndex] = {
            URL,
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
        if(!(req.auth)) {
            return res.status(500).json({ error: 'unauthenticated' });
        }

        const validated = this.validateGameRequest(req);

        if(validated.error) {
            return res.status(validated.code).json(validated.error);
        }

        const { auth, options, gameType } = validated;

        const { URL, gottiId} = await this.matchMake(gameType, auth, options);

        if(URL) {
            return res.status(200).json({ URL, gottiId });
        } else {
            return res.status(500).json('Invalid request');
        }
    }

    private async matchMake(gameType, auth?, options?) : Promise<any> {
        try {
            const definedMatchMaker = this.matchMakersByGameType.get(gameType);

            if(!(definedMatchMaker)) {
                throw `No matchmaking for ${gameType}`;
            }

            const availableGames = this.availableGamesByType[gameType];

            const { gameId, seatOptions } = definedMatchMaker(availableGames, auth, options);

            if(!(gameId in this.gamesById)) {
                throw `match maker gave gameId: ${gameId} which is not a valid game id.`;
            }

            const connectorData = this.gamesById[gameId].connectorsData[0]; // always sorted;

            const { URL, gottiId } = await this.addPlayerToConnector(connectorData.serverIndex, auth, seatOptions);
            return { URL, gottiId };
        } catch (err) {
            throw err;
        }
    }

    private getPublicGateData() {
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

    public gateKeep(req, res) {
        if(this.onGateKeepHandler(req, res)) {
            res.status(200).json({ games: this.getPublicGateData() })
        } else {
            res.status(401).json('Error authenticating');
        }
    }
    public registerGateKeep(handler: (request, response) => any) {
        this.onGateKeepHandler = handler;
        this.onGateKeepHandler = this.onGateKeepHandler.bind(this);
    }
    private onGateKeepHandler(req, res) : any {
        return true
    }

    private validateGameRequest(req) : any {
        if(!(req.body) || !(req.body['gameType'] || !(req.body['gameType'] in this.availableGamesByType))) {
            return { error: 'Bad request', code: 400 }
        }
        return { gameType: req.body.gameType, options: req.body.options, auth: req.auth };
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
     * @param seatOptions
     * @returns {{URL, gottiId}}
     */
    private async addPlayerToConnector(serverIndex, auth?, seatOptions?) : Promise<any> {
        const connectorData = this.connectorsByServerIndex[serverIndex];
        try {
            const { URL, gottiId } = await this.reserveSeat(serverIndex, auth, seatOptions);
            connectorData.connectedClients++;
            //sorts
            this.gamesById[connectorData.gameId].connectorsData.sort(sortByProperty('connectedClients'));
            return { URL, gottiId } ;
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
    }
}
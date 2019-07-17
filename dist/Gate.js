"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dist_1 = require("gotti-reqres/dist");
const Util_1 = require("./Util");
class Gate {
    constructor(gateURI) {
        this.urls = [];
        this.connectorsByServerIndex = {};
        // used for reconnections
        this.connectedClients = new Map();
        this.pendingClients = new Map();
        this.gamesById = {};
        this.availableGamesByType = {};
        this.unavailableGamesById = {};
        this.matchMakersByGameType = new Map();
        this.playerIndex = 0;
        this.heartbeat = null;
        this.gateKeep = this.gateKeep.bind(this);
        this.gameRequested = this.gameRequested.bind(this);
        this.requestBroker = new dist_1.Broker(gateURI, 'gate');
        this.requester = new dist_1.Messenger({
            id: 'gate_requester',
            brokerURI: gateURI,
            request: { timeout: 1000 }
        });
        //TODO: initialize subscriber socket
    }
    makeGameAvailable(gameId) {
        if (gameId in this.unavailableGamesById) {
            const gameData = this.unavailableGamesById[gameId];
            this.availableGamesByType[gameData.type][gameId] = gameData;
            delete this.unavailableGamesById[gameId];
            return true;
        }
    }
    makeGameUnavailable(gameId) {
        const gameData = this.gamesById[gameId];
        if (gameData && this.availableGamesByType[gameData.type] && this.availableGamesByType[gameData.type][gameId]) {
            this.unavailableGamesById[gameId] = gameData;
            delete this.availableGamesByType[gameData.type][gameId];
            return true;
        }
        return false;
    }
    defineMatchMaker(gameType, MatchMakerFunction) {
        if (!(this.availableGamesByType[gameType])) {
            throw new Error(`trying to define a match maker for unavaibale gameType ${gameType}`);
        }
        this.matchMakersByGameType.set(gameType, MatchMakerFunction);
    }
    createHeartbeatForConnector(connectorServerIndex) {
        let reqName = "2" /* HEARTBEAT */ + '-' + connectorServerIndex;
        this.requester.createRequest(reqName, `${connectorServerIndex}_responder`);
        return this.requester.requests[reqName].bind(this);
    }
    createReserveSeatForConnector(connectorServerIndex) {
        let reqName = "1" /* RESERVE_PLAYER_SEAT */ + '-' + connectorServerIndex;
        this.requester.createRequest(reqName, `${connectorServerIndex}_responder`);
        return this.requester.requests[reqName].bind(this);
    }
    async reserveSeat(connectorServerIndex, auth, seatOptions) {
        const tempId = Util_1.generateId();
        this.playerIndex++;
        if (this.playerIndex > 65535) {
            this.playerIndex = 0;
        }
        const playerIndex = this.playerIndex;
        try {
            this.pendingClients[tempId] = auth;
            let result = await this.connectorsByServerIndex[connectorServerIndex].reserveSeat({ auth, playerIndex, seatOptions });
            console.log('the result was', result);
            if (result && result.gottiId) {
                this.pendingClients.delete(tempId);
                this.connectedClients.set(result.gottiId, connectorServerIndex);
                const { host, port } = this.connectorsByServerIndex[connectorServerIndex];
                return {
                    gottiId: result.gottiId,
                    playerIndex,
                    host,
                    port,
                };
            }
            else {
                this.pendingClients.delete(tempId);
                throw new Error('Invalid response from connector room. Failed to connect.');
            }
        }
        catch (err) {
            console.log('error was', err);
            this.pendingClients.delete(tempId);
            throw err;
        }
    }
    // TODO: refactor this and adding games
    addGame(connectorsData, gameType, gameId, publicOptions) {
        if (gameId in this.gamesById) {
            throw `gameId: ${gameId} is being added for a second time. The first reference was ${this.gamesById[gameId]}`;
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
            publicOptions,
        };
        if (!(gameType in this.availableGamesByType)) {
            this.availableGamesByType[gameType] = {};
        }
        this.availableGamesByType[gameType][gameId] = this.gamesById[gameId];
    }
    addConnector(host, port, serverIndex, gameId) {
        const formatError = () => { return `error when adding connector SERVER_INDEX#: ${serverIndex}, host: ${host}, port: ${port} game ID:${gameId}`; };
        if (serverIndex in this.connectorsByServerIndex) {
            throw new Error(`${formatError()} because server index is already in connectors`);
        }
        for (let serverIndex in this.connectorsByServerIndex) {
            if (this.connectorsByServerIndex[serverIndex].host === host && this.connectorsByServerIndex[serverIndex].port === port) {
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
    async gameRequested(req, res) {
        if (!(req.auth)) {
            return res.status(500).json({ error: 'unauthenticated' });
        }
        const validated = this.validateGameRequest(req);
        if (validated.error) {
            return res.status(validated.code).json(validated.error);
        }
        const { auth, options, gameType } = validated;
        const { host, port, gottiId, playerIndex } = await this.matchMake(gameType, auth, options);
        if (host && port) {
            return res.status(200).json({ host, port, gottiId, playerIndex });
        }
        else {
            return res.status(500).json('Invalid request');
        }
    }
    /**
     *
     * @param gameType - type of game requested
     * @param auth - user authentication data
     * @param clientOptions - additional data about game request sent from client
     * @returns {{host, port, gottiId}}
     */
    async matchMake(gameType, auth, clientOptions) {
        try {
            const definedMatchMaker = this.matchMakersByGameType.get(gameType);
            if (!(definedMatchMaker)) {
                throw `No matchmaking for ${gameType}`;
            }
            const availableGames = this.availableGamesByType[gameType];
            const { gameId, seatOptions } = definedMatchMaker(availableGames, auth, clientOptions);
            if (!(gameId in this.gamesById)) {
                throw `match maker gave gameId: ${gameId} which is not a valid game id.`;
            }
            const connectorData = this.gamesById[gameId].connectorsData[0]; // always sorted;
            console.log('the connector data was', connectorData);
            const { host, port, gottiId, playerIndex } = await this.addPlayerToConnector(connectorData.serverIndex, auth, seatOptions);
            return { host, port, gottiId, playerIndex };
        }
        catch (err) {
            throw err;
        }
    }
    getPublicGateData() {
        let availableData = {};
        for (let key in this.availableGamesByType) {
            availableData[key] = {};
            for (let id in this.availableGamesByType[key]) {
                availableData[key][id] = {
                    options: this.availableGamesByType[key][id].publicOptions,
                };
            }
        }
        return availableData;
    }
    gateKeep(req, res) {
        if (this.onGateKeepHandler(req, res)) {
            res.status(200).json({ games: this.getPublicGateData() });
        }
        else {
            res.status(401).json('Error authenticating');
        }
    }
    registerGateKeep(handler) {
        this.onGateKeepHandler = handler;
        this.onGateKeepHandler = this.onGateKeepHandler.bind(this);
    }
    onGateKeepHandler(req, res) {
        return true;
    }
    validateGameRequest(req) {
        if (!(req.body) || !(req.body['gameType'] || !(req.body['gameType'] in this.availableGamesByType))) {
            return { error: 'Bad request', code: 400 };
        }
        return { gameType: req.body.gameType, options: req.body.options, auth: req.auth };
    }
    // gets connector for game type
    getLeastPopulatedConnector(gameId) {
        const { connectorsData } = this.gamesById[gameId];
        const connectorData = connectorsData[0];
    }
    /**
     *
     * @param serverIndex
     * @param auth
     * @param seatOptions
     * @returns {{host, port, gottiId}}
     */
    async addPlayerToConnector(serverIndex, auth, seatOptions) {
        const connectorData = this.connectorsByServerIndex[serverIndex];
        try {
            console.log('sending reserve seat....');
            const { host, port, gottiId, playerIndex } = await this.reserveSeat(serverIndex, auth, seatOptions);
            connectorData.connectedClients++;
            //sorts
            this.gamesById[connectorData.gameId].connectorsData.sort(Util_1.sortByProperty('connectedClients'));
            return { host, port, gottiId, playerIndex };
        }
        catch (err) {
            throw err;
        }
    }
    /**
     * Removes a player from the connector's count and then resorts the pool
     * @param serverIndex - server index that the connector lives on.
     */
    removePlayerFromConnector(serverIndex) {
        const connectorData = this.connectorsByServerIndex[serverIndex];
        connectorData.connectedClients--;
        //sorts
        this.gamesById[connectorData.gameId].connectorsData.sort(Util_1.sortByProperty('connectedClients'));
    }
    startConnectorHeartbeat(interval = 100000) {
        if (this.heartbeat) {
            this.stopConnectorHeartbeat();
        }
        this.heartbeat = setInterval(async () => {
            const heartbeats = Object.keys(this.connectorsByServerIndex).map(key => {
                return this.connectorsByServerIndex[key].heartbeat(1);
            });
            // https://stackoverflow.com/questions/31424561/wait-until-all-es6-promises-complete-even-rejected-promises/36115549#36115549
            Promise.all(heartbeats.map(hb => hb.catch(e => e)))
                .then(results => {
                let resLen = results.length;
                while (resLen--) {
                    if (!(results[resLen].error)) {
                    }
                    else {
                        this.handleHeartbeatResponse(results[resLen]);
                    }
                }
            });
        }, interval);
    }
    stopConnectorHeartbeat() {
        clearTimeout(this.heartbeat);
    }
    handleHeartbeatError(connector) {
    }
    handleHeartbeatResponse(response) {
        const connectorData = this.connectorsByServerIndex[response[0]];
        if (connectorData.connectedClients !== response[1]) {
            console.warn('the connected clients on gate did not match the count on the connector ', connectorData);
            connectorData.connectedClients = response[1];
            this.gamesById[connectorData.gameId].connectorsData.sort(Util_1.sortByProperty('connectedClients'));
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
    getClientCountOnConnector(serverIndex) {
        return this.connectorsByServerIndex[serverIndex].connectedClients;
    }
    getGameIdOfConnector(serverIndex) {
        return this.connectorsByServerIndex[serverIndex].gameId;
    }
    disconnect() {
        if (this.requester) {
            this.requester.close();
            this.requestBroker.close();
        }
    }
}
exports.Gate = Gate;

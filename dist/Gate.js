"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dist_1 = require("gotti-reqres/dist");
const Util_1 = require("./Util");
class Gate {
    constructor() {
        this.urls = [];
        this.userDefinedMatchMaker = null;
        this.connectorsByServerIndex = {};
        this.gamesByType = {};
        this.gamesById = {};
        this.heartbeat = null;
        this.gateKeep = this.gateKeep.bind(this);
        this.gameRequested = this.gameRequested.bind(this);
    }
    initializeServer(config) {
        let formatted = this.formatGamesData(config.gamesData);
        this.requestBroker = new dist_1.Broker(config.gateURI, 'gate');
        this.requester = new dist_1.Messenger({
            id: 'gate_requester',
            brokerURI: config.gateURI,
            request: { timeout: 1000 }
        });
        this.gamesByType = formatted.gamesByType;
        this.gamesById = formatted.gamesById;
        this.availableGamesByType = formatted.availableGamesByType;
        this.connectorsByServerIndex = formatted.connectorsByServerIndex;
        this.gamesByType = {};
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
        const { gameType, options } = validated;
        const url = await this.matchMake(gameType, options);
        if (url) {
            return res.status(200).json(url);
        }
        else {
            return res.status(500).json('Invalid request');
        }
    }
    async matchMake(gameType, options) {
        if (!(this.userDefinedMatchMaker)) {
            throw new Error('Please define a match making function using registerMathMaker');
        }
        let foundGameId = this.userDefinedMatchMaker(this.availableGamesByType[gameType], options);
        if (!foundGameId) {
            return false;
        }
        //todo: implement my req/res socket lib to send request to channel to reserve seat for client
        //let connected = await this.connectPlayer(connectorGateURI)
        // if(connected)
        // gets first element in connector since it's always sorted.
        const connectorData = this.gamesByType[gameType].connectorsData[0];
        this.addPlayerToConnector(connectorData.serverIndex);
        return connectorData.URL;
    }
    registerMatchMaker(handler) {
        this.userDefinedMatchMaker = handler;
    }
    /**
     * Returns lowest valued gameId in map.
     * @param gamesById - Dictionary of available games for a certain game type
     */
    defaultMatchMaker(gamesById) {
        // returns game id with smallest valued id
        let lowest = null;
        Object.keys(gamesById).forEach(gId => {
            if (lowest === null) {
                lowest = gId;
            }
            else {
                if (gId < lowest) {
                    lowest = gId;
                }
            }
        });
        if (lowest === null) {
            throw new Error('No available games were presented in the match maker.');
        }
        return lowest;
    }
    gateKeep(req, res) {
        if (this.onGateKeepHandler(req, res)) {
            res.status(200).json({ games: this.availableGamesByType });
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
        if (!(req.body) || !(req.body['gameType']) || !(req.body['gameType'] in this.gamesById)) {
            return { error: 'Bad request', code: 400 };
        }
        return { gameType: this.gamesById[req.body['gameType']], options: req.body.options };
    }
    // gets connector for game type
    getLeastPopulatedConnector(gameId) {
        const { connectorsData } = this.gamesById[gameId];
        const connectorData = connectorsData[0];
    }
    registerConnectorSubs() {
        // this.subscriber.createSubscription(connectorId, 'player_joined', this.addPlayerToConnector.bind(null, connectorId))
    }
    /**
     * Adds a player to the connector's count and then resorts the pool
     * @param serverIndex - server index that the connector lives on.
     */
    addPlayerToConnector(serverIndex) {
        const connectorData = this.connectorsByServerIndex[serverIndex];
        connectorData.connectedClients++;
        //sorts
        this.gamesById[connectorData.gameId].connectorsData.sort(Util_1.sortByProperty('connectedClients'));
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
                return this.connectorsByServerIndex[key].heartbeat;
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
    formatGamesData(gamesData) {
        let gamesByType = {};
        let gamesById = {};
        let connectorsByServerIndex = {};
        let availableGamesByType = {};
        gamesData.forEach(g => {
            if (!(g.type in gamesByType)) {
                gamesByType[g.type] = [];
                availableGamesByType[g.type] = [];
            }
            if (g.id in gamesById) {
                throw new Error(`Multiple games with the same id: ${g.id}`);
            }
            availableGamesByType[g.type].push(g.id);
            gamesById[g.id] = g;
            gamesByType[g.type].push(g);
            g.connectorsData.forEach(c => {
                if (c.serverIndex in connectorsByServerIndex) {
                    throw new Error(`different games ${connectorsByServerIndex[c.serverIndex].gameId} and ${g.id} are using the same connector ${c.serverIndex}`);
                }
                connectorsByServerIndex[c.serverIndex] = c;
            });
        });
        return { gamesById, gamesByType, connectorsByServerIndex, availableGamesByType };
    }
    getClientCountOnConnector(serverIndex) {
        return this.connectorsByServerIndex[serverIndex].connectedClients;
    }
    getGameIdOfConnector(serverIndex) {
        return this.connectorsByServerIndex[serverIndex].gameId;
    }
}
exports.Gate = Gate;

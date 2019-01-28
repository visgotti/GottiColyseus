import { Config } from './Config';

import { sortByProperty } from './Util';

export interface ConnectorData {
    connectedClients: number,
    game: GameData;
    region?: string,
}

export type GameTypeData = {[gameId: string]: GameData }

export interface GameData {
    connectors: Array<ConnectorData>;
}

export class Gate {
    public urls = [];
    private onGateKeepHandler: Function;
    private connectors: { [id: string]: ConnectorData } = {};
    private gamesByType: any = {};

    constructor(config: Config) {
        this.connectors = rgis
        this.gateKeep = this.gateKeep.bind(this);
        this.gameRequested = this.gameRequested.bind(this);

        this.gamesByType = {};
    }

    public registerGameResponder(handler: (gameType, gameRegion?, options?) => {}) {
        this.onGameRequestHandler = handler;
    }

    public registerGateKeep(handler: (request, response) => {}) {
        this.onGateKeepHandler = handler;
        this.onGateKeepHandler = this.onGateKeepHandler.bind(this);
    }

    public async gameRequested(req, res) {
        const validated = this.validateGameRequest(req);

        if(!(validated.gameType)) {
            return res.status(validated.code).json(validated.message);
        }

        const { gameType, gameRegion, options } = validated;

        const userValidated = await this.onGameRequestHandler(gameType, gameRegion, options);

        if(!(userValidated)) {
            let errCode = userValidated.code | 404;
            let errMessage = userValidated.message | 'Error requesting game';
            res.status(errCode).json(errMessage);
        } else {
            //todo: implement my req/res socket lib to send request to channel to reserve seat for client
            //let connected = await this.connectPlayer(connectorGateURI)
            // if(connected)

            // gets first element in connector since it's always sorted.
            const connectorData = this.gamesByType[gameType].connectors[0];

            res.status(200).json(URI);
        }
    }

    // by default it automatically returns true
    private onGameRequestHandler(gameType, gameRegion, options) {
        return true;
    }

    public gateKeep(req, res) {
        if(this.onGateKeepHandler(req, res)) {
            res.status(200).json(this.urls)
        } else {
            res.status(401).json(this.urls);
        }
    }

    private validateGameRequest(req) {
        if(!(req.body) || !(req.body['gameType']) || !(req.body['gameType'] in this.gamesByType)) {
            return { code: 400, message: 'Bad request.' }
        }

        return { gameType: req.body.gameType, gameRegion: req.body.gameRegion };
    }

    private onGateKeepHandler(gameType, gameRegion) {
    }

    private getLeastPopulatedConnector(gameType, gameRegion?) {
        const { connectors } = this.gamesByType[gameType];
        const connectorData = connectors[0];
    }

    private registerConnectorSubs() {
        // this.subscriber.createSubscription(connectorId, 'player_joined', this.addPlayerToConnector.bind(null, connectorId))
    }

    private addPlayerToConnector(connectorId) {
        const connectorData = this.connectors[connectorId];
        connectorData.connectedClients++;

        //sorts
        connectorData.game.connectors.sort(sortByProperty('connectedClients'))
    }

    private removePlayerFromConnector(connectorId) {
        const connectorData = this.connectors[connectorId];
        connectorData.connectedClients++;

        //sorts
        connectorData.game.connectors.sort(sortByProperty('connectedClients'))
    }

    public startConnectorHeartbeat(interval=100000) {
        this.heartbeat = setInterval(async() => {
            const heartbeats = Object.keys(this.connectors).map(key => {
                return this.connectors[key].heartbeat;
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

    private handleHeartbeatError(connector)

    private handleHeartbeatResponse(response) {
       const connectorData = this.connectors[response[0]];
       if(connectorData.connectedClients !== response[1]) {
           console.warn('the connected clients on gate did not match the count on the connector ', connectorData);
           connectorData.connectedClients = response[1];
           connectorData.game.connectors.sort(sortByProperty('connectedClients'))
       }
    }

    private stopConnectorHeartbeat()

    private initializeConnectorData(config: Config) : Array<ConnectorData> {}
    private initializeGameData(config: Config) {};
}
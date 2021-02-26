import { GateWebServer} from "../../../src";
export function createGate(serverURI: string, webPort: number, connectorData?: Array<{serverIndex: number, host: string, port: number, proxyId: string }>, gameData?: { gameType: string, gameId: string, gameData: any, areaData: any, publicOptions?: any }) {
    const gateServer = new GateWebServer({ public: serverURI }, webPort);
    if(connectorData && gameData) {
        gateServer.gate.addGame(connectorData, gameData.gameType, gameData.gameId, gameData.gameData, gameData.areaData, gameData.publicOptions);
    }
    return gateServer;
}


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dist_1 = require("gotti-channels/dist");
const Protocol_1 = require("./Protocol");
class MasterServer {
    constructor() {
        this.connectorsByServerIndex = {};
        this.masterChannel = null;
        this.backChannel = null;
        this.masterChannel = new dist_1.BackMaster(Protocol_1.GOTTI_MASTER_SERVER_INDEX);
        this.masterChannel.addChannels(Protocol_1.GOTTI_MASTER_CHANNEL_ID);
        this.backChannel = this.masterChannel.backChannels[Protocol_1.GOTTI_MASTER_CHANNEL_ID];
    }
    /**
     * sends message to connector servers that can be handled with onGateMessage implementation
     * @param message
     */
    sendConnectors(message) {
        this.backChannel.broadcast(message);
    }
    initializeGracefulShutdown() {
        //todo send messages to connector servers to let it know gate is down?
        function cleanup(sig) {
            this.masterChannel.close();
        }
        process.on('SIGINT', cleanup.bind(null, 'SIGINT'));
        process.on('SIGTERM', cleanup.bind(null, 'SIGTERM'));
    }
    addConnector(host, port, serverIndex, gameId) {
        const formatError = () => {
            return `error when adding connector SERVER_INDEX#: ${serverIndex}, host: ${host}, port: ${port} game ID:${gameId}`;
        };
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
        };
        return this.connectorsByServerIndex[serverIndex];
    }
}
exports.MasterServer = MasterServer;

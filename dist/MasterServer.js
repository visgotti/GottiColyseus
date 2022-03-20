"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dist_1 = require("gotti-channels/dist");
const Protocol_1 = require("./Protocol");
class MasterServer {
    constructor(options) {
        this.connectorsByServerIndex = {};
        this.masterChannel = null;
        this.channel = null;
        this.masterChannel = new dist_1.BackMaster(Protocol_1.GOTTI_MASTER_SERVER_INDEX);
        this.masterChannel.initialize(options.masterURI.public, options.connectorURIs.map(c => c.public));
        this.masterChannel.addChannels([Protocol_1.GOTTI_MASTER_CHANNEL_ID]);
        this.channel = this.masterChannel.backChannels[Protocol_1.GOTTI_MASTER_CHANNEL_ID];
        this.masterChannel.messenger.createPublish(37 /* GLOBAL_MASTER_MESSAGE */.toString());
        this.dispatchGlobal = this.masterChannel.messenger.publications[37 /* GLOBAL_MASTER_MESSAGE */.toString()];
        this.channel.onMessage((message) => {
            if (message[0] === 35 /* AREA_TO_MASTER_MESSAGE */) {
                this.onAreaMessage(message[1], message[2]);
            }
            else if (message[0] === 38 /* CONNECTOR_TO_MASTER_MESSAGE */) {
                this.onConnectorMessage(message[1], message[2]);
            }
        });
    }
    /**
     * sends message to an area that can be handled in any systems onMasterMessage
     * @param message
     */
    dispatchToAreas(message) {
        this.channel.broadcast([36 /* MASTER_TO_AREA_BROADCAST */, message]);
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gotti_pubsub_1 = require("gotti-pubsub");
const Protocol_1 = require("./Protocol");
class MasterServer {
    constructor(options) {
        this.connectorsByServerIndex = {};
        this.pubsub = new gotti_pubsub_1.Messenger(Protocol_1.GOTTI_MASTER_CHANNEL_ID);
        this.pubsub.initializePublisher(options.masterURI);
        this.pubsub.initializeSubscriber(options.connectorURIs);
        this.pubsub.createPublish(36 /* MASTER_TO_AREA_BROADCAST */.toString());
        this.dispatchToAreas = this.pubsub.publications[36 /* MASTER_TO_AREA_BROADCAST */.toString()];
        this.pubsub.createSubscription(35 /* AREA_TO_MASTER_MESSAGE */.toString(), 35 /* AREA_TO_MASTER_MESSAGE */.toString(), (data) => {
            this.onAreaMessage(data[0], data[1]);
        });
        this.pubsub.createPublish(37 /* GLOBAL_MASTER_MESSAGE */.toString());
        // @ts-ignore
        this.dispatchGlobal = this.pubsub.publications[37 /* GLOBAL_MASTER_MESSAGE */.toString()];
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

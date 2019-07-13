import { Messenger as Requester, Broker } from 'gotti-reqres/dist';
import {BackChannel, BackMaster} from "gotti-channels/dist";
import { GateProtocol, GOTTI_MASTER_CHANNEL_ID, GOTTI_MASTER_SERVER_INDEX } from './Protocol';
import { sortByProperty, generateId } from './Util';

export interface ConnectorData {
    host: string,
    port: number,
    serverIndex: number,
}

export interface MasterConfig {
    masterURI: string,
    connectorsData: Array<ConnectorData>,
}

export class MasterServer {
    private connectorsByServerIndex: { [serverIndex: number]: ConnectorData } = {};
    private masterChannel: BackMaster = null;
    private backChannel: BackChannel = null;

    constructor() {
        this.masterChannel = new BackMaster(GOTTI_MASTER_SERVER_INDEX);
        this.masterChannel.addChannels(GOTTI_MASTER_CHANNEL_ID);
        this.backChannel = this.masterChannel.backChannels[GOTTI_MASTER_CHANNEL_ID];
    }

    /**
     * sends message to connector servers that can be handled with onGateMessage implementation
     * @param message
     */
    public sendConnectors(message: any) {
        this.backChannel.broadcast(message);
    }

    private initializeGracefulShutdown() {
        //todo send messages to connector servers to let it know gate is down?
        function cleanup(sig) {
            this.masterChannel.close();
        }

        process.on('SIGINT', cleanup.bind(null, 'SIGINT'));
        process.on('SIGTERM', cleanup.bind(null, 'SIGTERM'));
    }

    private addConnector(host, port, serverIndex, gameId): ConnectorData {
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
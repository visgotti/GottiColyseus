import { Messenger as Requester, Broker } from 'gotti-reqres/dist';
import { Messenger } from "gotti-pubsub";
import { GateProtocol, Protocol, GOTTI_MASTER_CHANNEL_ID, GOTTI_MASTER_SERVER_INDEX } from './Protocol';
import { sortByProperty, generateId } from './Util';
import {ConnectorClient as Client} from "./ConnectorClient";

export interface ConnectorData {
    host: string,
    port: number,
    serverIndex: number,
}

export interface MasterConfig {
    masterURI: string,
    connectorURIs: Array<string>,
}

export abstract class MasterServer {
    private connectorsByServerIndex: { [serverIndex: number]: ConnectorData } = {};
    public dispatchGlobal: (data) => void;
    private pubsub: Messenger;
    private dispatchToAreas: Function;
    constructor(options: MasterConfig) {
        this.pubsub = new Messenger(GOTTI_MASTER_CHANNEL_ID);
        this.pubsub.initializePublisher(options.masterURI);
        this.pubsub.initializeSubscriber(options.connectorURIs);

        this.pubsub.createPublish(Protocol.MASTER_TO_AREA_BROADCAST.toString());
        this.dispatchToAreas = this.pubsub.publications[Protocol.MASTER_TO_AREA_BROADCAST.toString()];

        this.pubsub.createSubscription(Protocol.AREA_TO_MASTER_MESSAGE.toString(), Protocol.AREA_TO_MASTER_MESSAGE.toString(), (data) => {
            this.onAreaMessage(data[0], data[1]);
        });
        this.pubsub.createPublish(Protocol.GLOBAL_MASTER_MESSAGE.toString());
        // @ts-ignore
        this.dispatchGlobal = this.pubsub.publications[Protocol.GLOBAL_MASTER_MESSAGE.toString()];
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
    public abstract onConnectorMessage(client: Client, message: any): void;
    public abstract onAreaMessage(areaId: Client, message: any): void;
}
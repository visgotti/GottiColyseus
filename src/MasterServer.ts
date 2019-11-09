import { Messenger as Requester, Broker } from 'gotti-reqres/dist';
import {BackChannel, BackMaster} from "gotti-channels/dist";
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
    private masterChannel: BackMaster = null;
    private channel: BackChannel = null;
    public dispatchGlobal: (data) => void;

    constructor(options: MasterConfig) {
        this.masterChannel = new BackMaster(GOTTI_MASTER_SERVER_INDEX);
        this.masterChannel.initialize(options.masterURI, options.connectorURIs);
        this.masterChannel.addChannels([GOTTI_MASTER_CHANNEL_ID]);
        this.channel = this.masterChannel.backChannels[GOTTI_MASTER_CHANNEL_ID];

        this.masterChannel.messenger.createPublish(Protocol.GLOBAL_MASTER_MESSAGE.toString());

        this.dispatchGlobal = this.masterChannel.messenger.publications[Protocol.GLOBAL_MASTER_MESSAGE.toString()];
        this.channel.onMessage((message) => {
            if(message[0] === Protocol.AREA_TO_MASTER_MESSAGE) {
                this.onAreaMessage(message[1], message[2]);
            }
        });
    }

    /**
     * sends message to an area that can be handled in any systems onMasterMessage
     * @param message
     */
    public dispatchToAreas(message: any){
        this.channel.broadcast([Protocol.MASTER_TO_AREA_BROADCAST, message])
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
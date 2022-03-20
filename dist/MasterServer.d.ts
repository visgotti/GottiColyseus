import { ConnectorClient as Client } from "./ConnectorClient";
import { ServerURI } from "./Connector";
export interface ConnectorData {
    host: string;
    port: number;
    serverIndex: number;
}
export interface MasterConfig {
    masterURI: ServerURI;
    connectorURIs: Array<ServerURI>;
}
export declare abstract class MasterServer {
    private connectorsByServerIndex;
    private masterChannel;
    private channel;
    dispatchGlobal: (data: any) => void;
    constructor(options: MasterConfig);
    /**
     * sends message to an area that can be handled in any systems onMasterMessage
     * @param message
     */
    dispatchToAreas(message: any): void;
    private initializeGracefulShutdown;
    private addConnector;
    abstract onConnectorMessage(connectorId: string, message: any): void;
    abstract onAreaMessage(areaId: Client, message: any): void;
}

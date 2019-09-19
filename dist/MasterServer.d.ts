import { ConnectorClient as Client } from "./ConnectorClient";
export interface ConnectorData {
    host: string;
    port: number;
    serverIndex: number;
}
export interface MasterConfig {
    masterURI: string;
    connectorURIs: Array<string>;
}
export declare abstract class MasterServer {
    private connectorsByServerIndex;
    private masterChannel;
    private channel;
    constructor(options: MasterConfig);
    /**
     * sends message to an area that can be handled in any systems onMasterMessage
     * @param message
     */
    dispatchToAreas(message: any): void;
    private initializeGracefulShutdown;
    private addConnector;
    abstract onConnectorMessage(client: Client, message: any): void;
    abstract onAreaMessage(areaId: Client, message: any): void;
}

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
    dispatchGlobal: (data: any) => void;
    private pubsub;
    private dispatchToAreas;
    constructor(options: MasterConfig);
    private initializeGracefulShutdown;
    private addConnector;
    abstract onConnectorMessage(client: Client, message: any): void;
    abstract onAreaMessage(areaId: Client, message: any): void;
}

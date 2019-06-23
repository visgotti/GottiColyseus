export interface ConnectorData {
    host: string;
    port: number;
    serverIndex: number;
}
export interface MasterConfig {
    masterURI: string;
    connectorsData: Array<ConnectorData>;
}
export declare class MasterServer {
    private connectorsByServerIndex;
    private masterChannel;
    private backChannel;
    constructor();
    /**
     * sends message to connector servers that can be handled with onGateMessage implementation
     * @param message
     */
    sendConnectors(message: any): void;
    private initializeGracefulShutdown;
    private addConnector;
}

import { GateWebServer } from './WebServers/Gate';
import { BaseWebServer } from "./WebServers/Base";
import { ServerURI } from "./Connector";
export declare class WebServer extends BaseWebServer {
    app: any;
    gate: GateWebServer;
    auth: any;
    private isInitialized;
    private server;
    readonly publicPath: string;
    readonly clientFilePath: string;
    readonly port: number;
    constructor(port: any, clientFilePath: any, publicContentPath: any);
    addHandler(route: string, handler: Function): void;
    init(): Promise<{}>;
    hostAuth(gateURI: ServerURI, authSessionTimeout?: any): void;
    hostGate(gateURI: ServerURI): Promise<boolean>;
}

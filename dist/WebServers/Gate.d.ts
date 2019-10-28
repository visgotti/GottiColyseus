import { BaseWebServer } from "./Base";
import { Gate } from '../Gate';
export declare class GateWebServer extends BaseWebServer {
    app: any;
    private server;
    private onAuthHandler;
    private onInitHandler;
    readonly clientPath: string;
    private requester;
    readonly port: number;
    private reserveGateRequest;
    gate: Gate;
    constructor(gateURI: any, port?: any);
    addHandler(route: any, handler: any): void;
    registerOnGetGames(handler: any): void;
    init(app?: any): Promise<boolean>;
}

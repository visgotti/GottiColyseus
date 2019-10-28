import { BaseWebServer } from "./Base";
export declare class Authentication extends BaseWebServer {
    app: any;
    private server;
    private onAuthHandler;
    private onRegisterHandler;
    private onForgotPasswordHandler;
    private onInitHandler;
    readonly clientPath: string;
    private requester;
    private reserveGateRequest;
    readonly port: number;
    constructor(gateURI: any, port?: any);
    init(app?: any): Promise<boolean>;
    addOnAuth(handler: any): void;
    addOnRegister(handler: any): void;
    private setClientAuth;
    addHandler(route: any, handler: any): void;
    onRegister(req: any, res: any): Promise<any>;
    onAuth(req: any, res: any): Promise<any>;
}

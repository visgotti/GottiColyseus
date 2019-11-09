import { BaseWebServer } from "./Base";
declare class AuthenticationBase extends BaseWebServer {
    app: any;
    private server;
    private onAuthHandler;
    private onRegisterHandler;
    private onForgotPasswordHandler;
    private masterServerURI;
    private onMasterMessageHandler;
    private onInitHandler;
    readonly clientPath: string;
    private requester;
    private reserveGateRequest;
    readonly port: number;
    private authTimeout;
    private authMap;
    private dataHandler;
    readonly data: any;
    constructor(gateURI: any, port: any, app?: any, sessionTimeout?: any);
    init(dataInitHandler?: any, masterURI?: any): Promise<boolean>;
    addOnMasterMessageHandler(handler: any): void;
    addOnAuth(handler: any): void;
    addOnRegister(handler: any): void;
    private setClientAuth;
    addHandler(route: any, handler: any): void;
    private removeOldAuth;
    onRegister(req: any, res: any): Promise<any>;
    onAuth(req: any, res: any): Promise<any>;
}
declare const Authentication: {
    new (...args: any[]): {
        [x: string]: any;
        masterServerURI: string;
        masterServerChannel: import("gotti-channels").FrontChannel;
        masterListener: import("gotti-pubsub").Messenger;
        addGlobalMasterServerHandler(masterURI: any, handler: any, id: any): void;
    };
} & typeof AuthenticationBase;
export default Authentication;

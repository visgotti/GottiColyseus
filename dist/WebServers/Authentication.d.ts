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
    readonly data: any;
    private authApi;
    constructor(gateURI: any, port: any, app?: any, sessionTimeout?: any);
    init(dataInitHandler?: any, masterURI?: any): Promise<boolean>;
    addOnMasterMessageHandler(handler: any): void;
    addOnAuth(handler: any): void;
    addOnRegister(handler: any): void;
    private makeRequestApi;
    addHandler(route: any, handler: any): void;
    private getAuth;
    private updateAuth;
    private refreshAuth;
    onRegister(req: any, res: any): Promise<any>;
    onAuth(req: any, res: any): Promise<any>;
    private removeOldAuth;
    private addAuthToMap;
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

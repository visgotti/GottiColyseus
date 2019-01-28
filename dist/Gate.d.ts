export declare class Gate {
    urls: any[];
    private onGateKeepHandler;
    constructor(urls: Array<string>);
    registerGateKeep(handler: (request: any, response: any) => {}): void;
    gateKeep(req: any, res: any): void;
}

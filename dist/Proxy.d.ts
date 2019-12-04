declare type ConnectorProxy = {
    proxyId: string;
    host: string;
    port: number;
};
export declare class Proxy {
    private app;
    private proxyPort;
    private currentWebContentIdx;
    private currentWebApiIdx;
    private authUrl;
    private gateUrl;
    private webUrls;
    private connectorProxies;
    private server;
    constructor(authUrl: any, gateUrl: any, webUrls: any, proxyPort?: number, connectorProxies?: Array<ConnectorProxy>);
    private getContentHostRoundRobin;
    private getApiHostRoundRobin;
    init(): Promise<{}>;
}
export {};

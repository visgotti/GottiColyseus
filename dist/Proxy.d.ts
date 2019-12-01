export declare class Proxy {
    private app;
    private proxyPort;
    private currentWebContentIdx;
    private currentWebApiIdx;
    private authUrl;
    private gateUrl;
    private webUrls;
    private server;
    constructor(authUrl: any, gateUrl: any, webUrls: any, proxyPort?: number);
    private getContentHostRoundRobin;
    private getApiHostRoundRobin;
    init(): Promise<{}>;
}

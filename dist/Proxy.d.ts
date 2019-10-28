export declare class Proxy {
    private app;
    private proxyPort;
    private currentWebUrlIdx;
    private authUrl;
    private gateUrl;
    private webUrls;
    private server;
    constructor(domain: any, authUrl: any, gateUrl: any, webUrls: any, proxyPort?: number);
    private getContentHostRoundRobin;
    init(): Promise<{}>;
}

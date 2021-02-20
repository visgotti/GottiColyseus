import {GOTTI_ROUTE_BODY_PAYLOAD, GOTTI_HTTP_ROUTES} from "./Protocol";

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const proxy = require('http-proxy-middleware');

type ConnectorProxy = { proxyId: string, host: string, port: number };

export class Proxy {
    private app: any;
    private proxyPort: number;
    private currentWebContentIdx = 0;
    private currentWebApiIdx = 0;
    private authUrl: string;
    private gateUrl: string;
    private webUrls: Array<string>;
    private connectorProxies: any;
    private server: any;
    constructor(authUrl, gateUrl, webUrls, proxyPort=80, connectorProxies?: Array<ConnectorProxy>, useSSL=false) {
        this.authUrl = authUrl;
        this.gateUrl = gateUrl;
        this.webUrls = webUrls;
        this.proxyPort = proxyPort;
        this.app = express();
        this.connectorProxies = {};
        const wsProtocol = useSSL ? 'https' : 'http';
        connectorProxies && connectorProxies.forEach(({ proxyId, host, port }) => {
            this.connectorProxies[`${GOTTI_HTTP_ROUTES.CONNECTOR}/${proxyId}`] = `${wsProtocol}://${host}:${port}`;
        });
    }
    private getContentHostRoundRobin() {
        if(this.currentWebContentIdx === this.webUrls.length) this.currentWebContentIdx = 0;
        return this.webUrls[this.currentWebContentIdx++];
    }
    private getApiHostRoundRobin() {
        if(this.currentWebApiIdx === this.webUrls.length) this.currentWebApiIdx = 0;
        return this.webUrls[this.currentWebApiIdx++];
    }
    public async init() {
        this.app.use(helmet());
        this.authUrl && this.app.use(`${GOTTI_HTTP_ROUTES.BASE_AUTH}`, proxy({ target: this.authUrl }));
        this.gateUrl && this.app.use(`${GOTTI_HTTP_ROUTES.BASE_GATE}`, proxy({ target: this.gateUrl }));
        this.app.use(`${GOTTI_HTTP_ROUTES.BASE_PUBLIC_API}`, proxy({
            router: this.getApiHostRoundRobin(),
            target: this.webUrls[this.currentWebContentIdx],
        }));

        const wsProxy = proxy({
            ws: true,
            router: this.connectorProxies,
            target: this.connectorProxies[Object.keys(this.connectorProxies)[0]]
        });

        this.app.use(`${GOTTI_HTTP_ROUTES.CONNECTOR}`, wsProxy);

        this.app.use('/', proxy({
            router: this.getContentHostRoundRobin.bind(this),
            target: this.webUrls[this.currentWebContentIdx],
        }));

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.proxyPort, () => {
                this.server.on('upgrade', wsProxy.upgrade);
                return resolve(true);
            });
        })
    }
}
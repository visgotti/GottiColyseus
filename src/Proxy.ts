import {GOTTI_ROUTE_BODY_PAYLOAD, GOTTI_HTTP_ROUTES} from "./Protocol";

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const proxy = require('http-proxy-middleware');

export class Proxy {
    private app: any;
    private proxyPort: number;
    private currentWebUrlIdx = 0;
    private authUrl: string;
    private gateUrl: string;
    private webUrls: Array<string>;
    private server: any;
    constructor(domain, authUrl, gateUrl, webUrls, proxyPort=80) {
        this.authUrl = authUrl;
        this.gateUrl = gateUrl;
        this.webUrls = webUrls;
        this.proxyPort = proxyPort;
        this.app = express();
    }

    private getContentHostRoundRobin() {
        if(this.currentWebUrlIdx === this.webUrls.length) this.currentWebUrlIdx = 0;
        return this.webUrls[this.currentWebUrlIdx++];
    }

    public async init() {
        this.app.use(helmet());
        this.app.use(`${GOTTI_HTTP_ROUTES.BASE_AUTH}`, proxy({ target: this.authUrl }));
        this.app.use(`${GOTTI_HTTP_ROUTES.BASE_GATE}`, proxy({ target: this.gateUrl }));

        this.app.use('/', proxy({
            router: this.getContentHostRoundRobin.bind(this),
            target: this.webUrls[this.currentWebUrlIdx],
        }));

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.proxyPort, () => {
                return resolve(true);
            });
        })
    }
}
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Protocol_1 = require("./Protocol");
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const proxy = require('http-proxy-middleware');
class Proxy {
    constructor(authUrl, gateUrl, webUrls, proxyPort = 80, connectorProxies, useSSL = false) {
        this.currentWebContentIdx = 0;
        this.currentWebApiIdx = 0;
        this.authUrl = authUrl;
        this.gateUrl = gateUrl;
        this.webUrls = webUrls;
        this.proxyPort = proxyPort;
        this.app = express();
        this.connectorProxies = {};
        const wsProtocol = useSSL ? 'https' : 'http';
        connectorProxies && connectorProxies.forEach(({ proxyId, host, port }) => {
            this.connectorProxies[`${Protocol_1.GOTTI_HTTP_ROUTES.CONNECTOR}/${proxyId}`] = `${wsProtocol}://${host}:${port}`;
        });
    }
    getContentHostRoundRobin() {
        if (this.currentWebContentIdx === this.webUrls.length)
            this.currentWebContentIdx = 0;
        return this.webUrls[this.currentWebContentIdx++];
    }
    getApiHostRoundRobin() {
        if (this.currentWebApiIdx === this.webUrls.length)
            this.currentWebApiIdx = 0;
        return this.webUrls[this.currentWebApiIdx++];
    }
    async init() {
        this.app.use(helmet());
        this.authUrl && this.app.use(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_AUTH}`, proxy({ target: this.authUrl }));
        this.gateUrl && this.app.use(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_GATE}`, proxy({ target: this.gateUrl }));
        this.app.use(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_PUBLIC_API}`, proxy({
            router: this.getApiHostRoundRobin(),
            target: this.webUrls[this.currentWebContentIdx],
        }));
        const wsProxy = proxy({
            ws: true,
            router: this.connectorProxies,
            target: this.connectorProxies[Object.keys(this.connectorProxies)[0]]
        });
        this.app.use(`${Protocol_1.GOTTI_HTTP_ROUTES.CONNECTOR}`, wsProxy);
        this.app.use('/', proxy({
            router: this.getContentHostRoundRobin.bind(this),
            target: this.webUrls[this.currentWebContentIdx],
        }));
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.proxyPort, () => {
                this.server.on('upgrade', wsProxy.upgrade);
                return resolve(true);
            });
        });
    }
}
exports.Proxy = Proxy;

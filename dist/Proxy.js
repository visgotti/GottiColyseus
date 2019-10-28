"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Protocol_1 = require("./Protocol");
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const proxy = require('express-http-proxy');
class Proxy {
    constructor(domain, authUrl, gateUrl, webUrls, proxyPort = 80) {
        this.currentWebUrlIdx = 0;
        this.authUrl = authUrl;
        this.gateUrl = gateUrl;
        this.webUrls = webUrls;
        this.proxyPort = proxyPort;
        this.app = express();
    }
    getContentHostRoundRobin() {
        if (this.currentWebUrlIdx === this.webUrls.length)
            this.currentWebUrlIdx = 0;
        return this.webUrls[this.currentWebUrlIdx++];
    }
    async init() {
        this.app.use('/', proxy(this.getContentHostRoundRobin.bind(this)));
        this.app.use(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_AUTH}`, proxy(this.authUrl));
        this.app.use(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_GATE}`, proxy(this.gateUrl));
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.proxyPort, () => {
                return resolve(true);
            });
        });
    }
}
exports.Proxy = Proxy;

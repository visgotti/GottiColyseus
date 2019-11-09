"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Protocol_1 = require("./Protocol");
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const _1 = require("./");
const Gate_1 = require("./WebServers/Gate");
const Base_1 = require("./WebServers/Base");
class WebServer extends Base_1.BaseWebServer {
    constructor(port, clientFilePath, publicContentPath) {
        super();
        this.isInitialized = false;
        this.publicPath = publicContentPath;
        this.clientFilePath = clientFilePath;
        this.app = express();
        this.port = port;
    }
    addHandler(route, handler) {
        this.app.post(`/${route}`, async (req, res) => {
            try {
                const clientRequestOptions = req.body[Protocol_1.GOTTI_ROUTE_BODY_PAYLOAD];
                const response = await handler(clientRequestOptions);
                return res.send(200).json(response);
            }
            catch (err) {
                const msg = err.message ? err.message : err;
                return res.send(401).json(msg);
            }
        });
    }
    async init() {
        this.app.use(helmet());
        this.app.use('/', express.static(this.publicPath));
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(bodyParser.text());
        this.app.use(bodyParser.json({ type: 'application/json' }));
        this.app.get('/', (req, res) => {
            res.sendFile(this.clientFilePath);
        });
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                this.isInitialized = true;
                return resolve(true);
            });
        });
    }
    hostAuth(gateURI, authSessionTimeout) {
        this.auth = new _1.AuthWebServer(gateURI, this.port, this.app, authSessionTimeout);
    }
    async hostGate(gateURI) {
        this.gate = new Gate_1.GateWebServer(gateURI);
        return this.gate.init(this.app);
    }
}
exports.WebServer = WebServer;

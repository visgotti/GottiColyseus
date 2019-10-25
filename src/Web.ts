const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');

import { generateId } from "./Util";

import { Authentication } from './WebServers/Authentication';
import { GateWebServer } from './WebServers/Gate';
import { BaseWebServer } from "./WebServers/Base";

export class WebServer extends BaseWebServer {
    public app: any;
    private gate: GateWebServer;
    private auth: Authentication;
    private isInitialized: boolean = false;
    private server: any;
    readonly clientPath: string;
    readonly port: number;

    constructor(port, clientPath) {
        super();
        this.clientPath = clientPath;
        this.app = express();
        this.port = port;
    }

    public async init() {
        this.app.use(helmet());
        this.app.use('/', express.static(this.clientPath));
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.text());
        this.app.use(bodyParser.json({type: 'application/json'}));
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                this.isInitialized = true;
                return resolve(true);
            });
        })
    }

    public async hostAuth(gateURI) {
        this.auth = new Authentication(gateURI);
        return this.auth.init(this.app);
    }

    public async hostGate(gateURI) {
        this.gate = new GateWebServer(gateURI);
        return this.gate.init(this.app);
    }
}
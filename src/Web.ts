import {GOTTI_ROUTE_BODY_PAYLOAD} from "./Protocol";

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
    public gate: GateWebServer;
    public auth: Authentication;
    private isInitialized: boolean = false;
    private server: any;
    readonly publicPath: string;
    readonly clientFilePath: string;
    readonly port: number;

    constructor(port, clientFilePath, publicContentPath) {
        super();
        this.publicPath = publicContentPath;
        this.clientFilePath = clientFilePath;
        this.app = express();
        this.port = port;
    }

    public addHandler(route: string, handler: Function) {
        this.app.post(`/${route}`, async (req, res) => {
            try {
                const clientRequestOptions = req.body[GOTTI_ROUTE_BODY_PAYLOAD];
                const response = await handler(clientRequestOptions);
                return res.send(200).json(response);
            } catch(err) {
                const msg = err.message ? err.message : err;
                return res.send(401).json(msg);
            }
        });
    }

    public async init() {
        this.app.use(helmet());
        this.app.use('/', express.static(this.publicPath));
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.text());
        this.app.use(bodyParser.json({type: 'application/json'}));

        this.app.get('/', (req, res) => {
            res.sendFile(this.clientFilePath);
        });

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
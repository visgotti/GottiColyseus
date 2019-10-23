const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');

import { generateId } from "./Util";

const GOTTI_AUTH_KEY = '__gotti_auth__';
const GOTTI_GATE_PASS = '__gotti_gate_pass__';
export class Web {
    private app: any;
    private onAuthHandler: Function;
    private onInitHandler: Function;
    readonly clientPath: string;
    constructor(gateURI, clientPath) {
        this.clientPath = clientPath;
        this.app = express();
    }
    public async init() {
        this.app.use(helmet());
        this.app.use('/', express.static(this.clientPath));
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.text());
        this.app.use(bodyParser.json({type: 'application/json'}));
    }

}
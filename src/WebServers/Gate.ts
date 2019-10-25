import {BaseWebServer} from "./Base";

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');

import { generateId } from "../Util";
import { Messenger } from 'gotti-reqres/dist';

import {GateProtocol, GOTTI_HTTP_ROUTES, GOTTI_GATE_CHANNEL_PREFIX, GOTTI_GATE_AUTH_ID, GOTTI_AUTH_KEY } from "../Protocol";

import { Gate } from '../Gate';

export class GateWebServer extends BaseWebServer {
    public app: any;
    private server: any;
    private onAuthHandler: Function;
    private onInitHandler: Function;
    readonly clientPath: string;
    private requester: Messenger;
    readonly port: number;
    private reserveGateRequest: Function;

    public gate: Gate;
    constructor(gateURI, port?) {
        super();
        this.gate = new Gate(gateURI);
        this.port = port;
    }

    public async init(app?) {
        if(app) {
            this.app = app;
        } else {
            if(!this.port) throw new Error(`No port was provided to gate server`);
            this.app = express();
            this.app.use(helmet());
            this.app.use(bodyParser.urlencoded({extended: true}));
            this.app.use(bodyParser.text());
            this.app.use(bodyParser.json({type: 'application/json'}));
            this.server = this.app.listen(this.port);
        }
        this.app.post(GOTTI_HTTP_ROUTES.GET_GAMES, this.gate.gateKeep.bind(this.gate));
        this.app.post(GOTTI_HTTP_ROUTES.JOIN_GAME, this.gate.gameRequested.bind(this.gate));
        return true;
    }

    private handleJoinGame(req, res) {
    }

    public addOnAuth(handler) {
        this.onAuthHandler = handler;
    }

    public onGateKeep() {

    }

    public async onAuth(req, res) {
        if(this.onAuthHandler) {
            try {
                const auth = await this.onAuthHandler(req[GOTTI_AUTH_KEY], req);
                if(!auth) {
                    return res.send(503)
                }
                const authId = await this.reserveGateRequest({
                    auth,
                });
                if(authId) {
                    return res.json({
                        [GOTTI_GATE_AUTH_ID]: authId,
                        [GOTTI_AUTH_KEY]: auth,
                    })
                } else {
                    return res.send(503)
                }
            } catch(err) {
                return res.send(503);
            }
        } else {
            return res.send('onAuth was not handled');
        }
    }
}
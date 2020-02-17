import {httpErrorHandler} from "../Util";

import {BaseWebServer} from "./Base";

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');

import { generateId } from "../Util";
import { Messenger } from 'gotti-reqres/dist';

import {
    GateProtocol,
    GOTTI_HTTP_ROUTES,
    GOTTI_GATE_CHANNEL_PREFIX,
    GOTTI_GATE_AUTH_ID,
    GOTTI_AUTH_KEY,
    GOTTI_ROUTE_BODY_PAYLOAD
} from "../Protocol";

import { Gate } from '../Gate';

export class GateWebServer extends BaseWebServer{
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

    addHandler(route, handler) {
        if(!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server')
        }
        this.app.post(route, async (req, res) => {
            try {
            const authId = req.body[GOTTI_GATE_AUTH_ID];
            if(!authId) {
                return res.status(503).json('Not authenticated.');
            }
            const auth = this.gate.getPlayerAuth(authId);
            if(!auth) {
                return res.status(503).json('not authenticated');
            }
            const responseObject = await handler(req.body[GOTTI_ROUTE_BODY_PAYLOAD], this.gate.publicGateData, auth);
            return res.json({[GOTTI_ROUTE_BODY_PAYLOAD]: responseObject });

            } catch(err) {
                return httpErrorHandler(res, err);
            }
        })
    }

    registerOnGetGames(handler) {
        this.gate.registerGateKeep(handler)
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
        this.app.post(`${GOTTI_HTTP_ROUTES.BASE_GATE}${GOTTI_HTTP_ROUTES.GET_GAMES}`, this.gate.gateKeep.bind(this.gate));
        this.app.post(`${GOTTI_HTTP_ROUTES.BASE_GATE}${GOTTI_HTTP_ROUTES.JOIN_GAME}`, this.gate.gameRequested.bind(this.gate));
        return true;
    }
}
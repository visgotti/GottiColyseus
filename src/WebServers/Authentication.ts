const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');

import { Messenger } from 'gotti-reqres/dist';

import { BaseWebServer } from "./Base";

import {GateProtocol, GOTTI_GATE_CHANNEL_PREFIX, GOTTI_GATE_AUTH_ID, GOTTI_AUTH_KEY, GOTTI_HTTP_ROUTES} from "../Protocol";

export class Authentication extends BaseWebServer {
    public app: any;
    private server: any;

    private onAuthHandler: Function;
    private onRegisterHandler: Function;
    private onForgotPasswordHandler: Function;

    private onInitHandler: Function;
    readonly clientPath: string;
    private requester: Messenger;
    private reserveGateRequest: Function;
    readonly port: number;

    constructor(gateURI, port?) {
        super();
        this.port = port;
        this.requester = new Messenger({
            id: 'authentication_requester',
            brokerURI: gateURI,
            request: { timeout: 1000 }
        });
    }

    public async init(app?) {
        if(app) {
            this.app = app;
        } else {
            this.app = express();
            this.app.use(helmet());
            this.app.use(bodyParser.urlencoded({extended: true}));
            this.app.use(bodyParser.text());
            this.app.use(bodyParser.json({type: 'application/json'}));
            this.server = this.app.listen(this.port);
        }

        const reqName = GOTTI_GATE_CHANNEL_PREFIX + '-' + GateProtocol.RESERVE_AUTHENTICATION;
        this.requester.createRequest(reqName, 'gate_requester');
        this.reserveGateRequest = this.requester.requests[reqName].bind(this);
        this.app.post(GOTTI_HTTP_ROUTES.AUTHENTICATE, this.onAuth.bind(this));
        return true;
    }

    public addOnAuth(handler) {
        this.onAuthHandler = handler;
    }
    public addOnRegister(handler) {
        this.onRegisterHandler = handler;
    }

    public async onRegister(req, res) {
        if(this.onRegisterHandler) {
            try {
                const auth = await this.onRegisterHandler(req[GOTTI_AUTH_KEY], req);
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
            return res.send('onRegister was not handled');
        }
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
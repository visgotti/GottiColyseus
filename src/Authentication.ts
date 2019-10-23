const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');

import { generateId } from "./Util";
import { Messenger } from 'gotti-reqres/dist';

import {GateProtocol, GOTTI_GATE_CHANNEL_PREFIX} from "./Protocol";

const GOTTI_AUTH_KEY = '__gotti_auth__';
const GOTTI_AUTH_ID = '__gotti_auth_id__';

export class Authentication {
    private app: any;
    private onAuthHandler: Function;
    private onInitHandler: Function;
    readonly clientPath: string;
    private requester: Messenger;
    private reserveGateRequest: Function;

    constructor(gateURI, clientPath) {
        this.clientPath = clientPath;
        this.requester = new Messenger({
            id: 'authentication_requester',
            brokerURI: gateURI,
            request: { timeout: 1000 }
        });
    }
    public async init(app) {
        if(app) {
            this.app = app;
        } else {
            this.app.use(helmet());
            this.app.use(bodyParser.urlencoded({extended: true}));
            this.app.use(bodyParser.text());
            this.app.use(bodyParser.json({type: 'application/json'}));
        }
        const reqName = GOTTI_GATE_CHANNEL_PREFIX + '-' + GateProtocol.RESERVE_AUTHENTICATION;
        this.requester.createRequest(reqName, 'gate_requester');
        this.reserveGateRequest = this.requester.requests[reqName].bind(this);
        this.app.use('/gotti_authenticate', this.onAuth.bind(this));
    }
    public addOnAuth(handler) {
        this.onAuthHandler = handler.bind(this);
    }

    public async onAuth(req, res) {
        if(this.onAuthHandler) {
            try {
                const auth = await this.onAuthHandler(req[GOTTI_AUTH_KEY], req);
                const authId = await this.reserveGateRequest({
                    auth,
                });
                if(auth && authId) {
                    res.json({
                        [GOTTI_AUTH_ID]: authId,
                        [GOTTI_AUTH_ID]: generateId(),
                    })
                } else {
                    res.send(503)
                }
            } catch(err) {
                res.send(503);
            }

        }
    }
}
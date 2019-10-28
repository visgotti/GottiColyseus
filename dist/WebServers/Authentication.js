"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const dist_1 = require("gotti-reqres/dist");
const Base_1 = require("./Base");
const Protocol_1 = require("../Protocol");
class Authentication extends Base_1.BaseWebServer {
    constructor(gateURI, port) {
        super();
        this.port = port;
        this.requester = new dist_1.Messenger({
            id: 'authentication_requester',
            brokerURI: gateURI,
            request: { timeout: 1000 }
        });
    }
    async init(app) {
        if (app) {
            this.app = app;
        }
        else {
            this.app = express();
            this.app.use(helmet());
            this.app.use(bodyParser.urlencoded({ extended: true }));
            this.app.use(bodyParser.text());
            this.app.use(bodyParser.json({ type: 'application/json' }));
            this.server = this.app.listen(this.port);
        }
        const reqName = Protocol_1.GOTTI_GATE_CHANNEL_PREFIX + '-' + "3" /* RESERVE_AUTHENTICATION */;
        this.requester.createRequest(reqName, 'gate_responder');
        this.reserveGateRequest = this.requester.requests[reqName].bind(this);
        this.app.post(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_AUTH}${Protocol_1.GOTTI_HTTP_ROUTES.AUTHENTICATE}`, this.onAuth.bind(this));
        this.app.post(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_AUTH}${Protocol_1.GOTTI_HTTP_ROUTES.REGISTER}`, this.onRegister.bind(this));
        return true;
    }
    addOnAuth(handler) {
        this.onAuthHandler = handler;
    }
    addOnRegister(handler) {
        this.onRegisterHandler = handler;
    }
    async setClientAuth(req, authObject) {
        const oldAuthId = req.body[Protocol_1.GOTTI_GATE_AUTH_ID];
        const newAuthId = await this.reserveGateRequest({
            auth: authObject,
            oldAuthId
        });
        req['GOTTI_AUTH'] = {
            [Protocol_1.GOTTI_GATE_AUTH_ID]: newAuthId,
            [Protocol_1.GOTTI_AUTH_KEY]: authObject
        };
        return authObject;
    }
    addHandler(route, handler) {
        if (!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server');
        }
        this.app.post(route, async (req, res) => {
            return Promise.resolve(handler(req.body[Protocol_1.GOTTI_ROUTE_BODY_PAYLOAD], this.setClientAuth.bind(this, req))).then((responseObject) => {
                return res.json({ responseObject, 'GOTTI_AUTH': req['GOTTI_AUTH'] });
            }).catch(err => {
                return res.json({ error: err });
            });
        });
    }
    async onRegister(req, res) {
        if (this.onRegisterHandler) {
            try {
                const auth = await this.onRegisterHandler(req.body[Protocol_1.GOTTI_AUTH_KEY], req);
                if (!auth) {
                    return res.send(503);
                }
                const authId = await this.reserveGateRequest({
                    auth,
                });
                if (authId) {
                    return res.json({
                        [Protocol_1.GOTTI_GATE_AUTH_ID]: authId,
                        [Protocol_1.GOTTI_AUTH_KEY]: auth,
                    });
                }
                else {
                    return res.send(503);
                }
            }
            catch (err) {
                return res.send(503);
            }
        }
        else {
            return res.send('onRegister was not handled');
        }
    }
    async onAuth(req, res) {
        if (this.onAuthHandler) {
            try {
                const oldAuthId = req.body[Protocol_1.GOTTI_GATE_AUTH_ID];
                const auth = await this.onAuthHandler(req.body[Protocol_1.GOTTI_AUTH_KEY], req);
                if (!auth) {
                    return res.send(503);
                }
                const authId = await this.reserveGateRequest({
                    auth,
                    oldAuthId
                });
                if (authId) {
                    return res.send(200).json({
                        [Protocol_1.GOTTI_GATE_AUTH_ID]: authId,
                        [Protocol_1.GOTTI_AUTH_KEY]: auth,
                    });
                }
                else {
                    return res.send(503);
                }
            }
            catch (err) {
                return res.send(503);
            }
        }
        else {
            return res.send('onAuth was not handled');
        }
    }
}
exports.Authentication = Authentication;

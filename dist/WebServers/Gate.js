"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Util_1 = require("../Util");
const Base_1 = require("./Base");
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const Protocol_1 = require("../Protocol");
const Gate_1 = require("../Gate");
class GateWebServer extends Base_1.BaseWebServer {
    constructor(gateURI, port) {
        super();
        this.gate = new Gate_1.Gate(gateURI);
        this.port = port;
    }
    addHandler(route, handler) {
        if (!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server');
        }
        this.app.post(route, async (req, res) => {
            try {
                const authId = req.body[Protocol_1.GOTTI_GATE_AUTH_ID];
                if (!authId) {
                    return res.status(503).json('Not authenticated.');
                }
                const auth = this.gate.getPlayerAuth(authId);
                if (!auth) {
                    return res.status(503).json('not authenticated');
                }
                const responseObject = await handler(req.body[Protocol_1.GOTTI_ROUTE_BODY_PAYLOAD], this.gate.publicGateData, auth);
                return res.json({ [Protocol_1.GOTTI_ROUTE_BODY_PAYLOAD]: responseObject });
            }
            catch (err) {
                return Util_1.httpErrorHandler(res, err);
            }
        });
    }
    registerOnGetGames(handler) {
        this.gate.registerGateKeep(handler);
    }
    async init(app) {
        if (app) {
            this.app = app;
        }
        else {
            if (!this.port)
                throw new Error(`No port was provided to gate server`);
            this.app = express();
            this.app.use(helmet());
            this.app.use(bodyParser.urlencoded({ extended: true }));
            this.app.use(bodyParser.text());
            this.app.use(bodyParser.json({ type: 'application/json' }));
            this.server = this.app.listen(this.port);
        }
        this.app.post(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_GATE}${Protocol_1.GOTTI_HTTP_ROUTES.GET_GAMES}`, this.gate.gateKeep.bind(this.gate));
        this.app.post(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_GATE}${Protocol_1.GOTTI_HTTP_ROUTES.JOIN_GAME}`, this.gate.gameRequested.bind(this.gate));
        return true;
    }
}
exports.GateWebServer = GateWebServer;

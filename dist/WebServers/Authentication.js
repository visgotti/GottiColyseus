"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Util_1 = require("../Util");
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const dist_1 = require("gotti-reqres/dist");
const Base_1 = require("./Base");
const Protocol_1 = require("../Protocol");
const MasterServerListener_1 = require("../Mixins/MasterServerListener");
class AuthenticationBase extends Base_1.BaseWebServer {
    constructor(gateURI, port, app, sessionTimeout) {
        super();
        this.authTimeout = 1000 * 60 * 60 * 12; // 12 hours
        this.authMap = new Map();
        this.data = {};
        this.authTimeout = sessionTimeout ? sessionTimeout : this.authTimeout;
        this.port = port;
        this.requester = new dist_1.Messenger({
            id: 'authentication_requester',
            brokerURI: gateURI.public,
            request: { timeout: 1000 }
        });
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
        this.authMap = new Map();
    }
    async init(dataInitHandler, masterURI) {
        if (dataInitHandler) {
            const _data = await dataInitHandler();
            Object.keys(_data).forEach(key => {
                this.data[key] = _data[key];
            });
        }
        const reqName = Protocol_1.GOTTI_GATE_CHANNEL_PREFIX + '-' + "3" /* RESERVE_AUTHENTICATION */;
        this.requester.createRequest(reqName, 'gate_responder');
        this.reserveGateRequest = this.requester.requests[reqName].bind(this);
        this.app.post(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_AUTH}${Protocol_1.GOTTI_HTTP_ROUTES.AUTHENTICATE}`, this.onAuth.bind(this));
        this.app.post(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_AUTH}${Protocol_1.GOTTI_HTTP_ROUTES.REGISTER}`, this.onRegister.bind(this));
        return true;
    }
    addOnMasterMessageHandler(handler) {
        this.onMasterMessageHandler = handler;
    }
    addOnAuth(handler) {
        this.onAuthHandler = handler;
    }
    addOnRegister(handler) {
        this.onRegisterHandler = handler;
    }
    makeRequestApi(req, authId) {
        return {
            refreshAuth: this.refreshAuth.bind(this, req, authId),
            updateAuth: this.updateAuth.bind(this, req, authId),
            getAuth: this.getAuth.bind(this)
        };
    }
    addHandler(route, handler) {
        if (!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server');
        }
        this.app.post(`${Protocol_1.GOTTI_HTTP_ROUTES.BASE_AUTH}/${route}`, async (req, res) => {
            const authId = req.body[Protocol_1.GOTTI_GATE_AUTH_ID];
            if (!authId) {
                return res.status(503).json('Not authenticated.');
            }
            const auth = this.authMap.get(authId);
            if (!auth) {
                return res.status(503).json('not authenticated');
            }
            try {
                return Promise.resolve(handler(req.body[Protocol_1.GOTTI_ROUTE_BODY_PAYLOAD], auth.auth, this.makeRequestApi(req, authId))).then((responseObject) => {
                    const response = { [Protocol_1.GOTTI_ROUTE_BODY_PAYLOAD]: responseObject };
                    if (req[Protocol_1.GOTTI_AUTH_KEY])
                        response[Protocol_1.GOTTI_AUTH_KEY] = req[Protocol_1.GOTTI_AUTH_KEY];
                    if (req[Protocol_1.GOTTI_GATE_AUTH_ID])
                        response[Protocol_1.GOTTI_GATE_AUTH_ID] = req[Protocol_1.GOTTI_GATE_AUTH_ID];
                    return res.json(response);
                });
            }
            catch (err) {
                return Util_1.httpErrorHandler(res, err);
            }
        });
    }
    getAuth(authId) {
        const auth = this.authMap.get(authId);
        if (auth) {
            return auth.auth;
        }
    }
    async updateAuth(req, authId, newAuthData, timeout) {
        try {
            const obj = {
                auth: newAuthData,
                oldAuthId: authId
            };
            if (timeout) {
                obj.timeout = timeout;
            }
            ;
            const newAuthId = await this.reserveGateRequest(obj);
            if (newAuthId) {
                this.addAuthToMap(authId, newAuthId, newAuthData);
                req[Protocol_1.GOTTI_GATE_AUTH_ID] = newAuthId;
                req[Protocol_1.GOTTI_AUTH_KEY] = newAuthData;
                return newAuthId;
            }
            return false;
        }
        catch (err) {
            return false;
        }
    }
    async refreshAuth(req, authId, timeout) {
        const oldAuth = this.authMap.get(authId);
        if (oldAuth) {
            try {
                const obj = {
                    refresh: true,
                    oldAuthId: authId
                };
                if (timeout) {
                    obj.timeout = timeout;
                }
                ;
                const newAuthId = await this.reserveGateRequest(obj);
                this.addAuthToMap(authId, newAuthId, oldAuth.auth);
                req[Protocol_1.GOTTI_GATE_AUTH_ID] = newAuthId;
                return newAuthId;
            }
            catch (err) {
                return false;
            }
        }
        else {
            return false;
        }
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
                    this.addAuthToMap(null, authId, auth);
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
                return Util_1.httpErrorHandler(res, err);
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
                const api = this.makeRequestApi(req, null);
                // only need the getAuth for api in onAuth since the return value
                // is basically the same logic of both of these.
                delete api['refreshAuth'];
                delete api['updateAuth'];
                const auth = await this.onAuthHandler(req.body[Protocol_1.GOTTI_AUTH_KEY], api, req);
                if (!auth) {
                    return res.sendStatus(503);
                }
                const authId = await this.reserveGateRequest({
                    auth,
                    oldAuthId
                });
                if (authId) {
                    this.addAuthToMap(oldAuthId, authId, auth);
                    return res.json({
                        [Protocol_1.GOTTI_GATE_AUTH_ID]: authId,
                        [Protocol_1.GOTTI_AUTH_KEY]: auth,
                    });
                }
                else {
                    return res.sendStatus(503);
                }
            }
            catch (err) {
                return Util_1.httpErrorHandler(res, err);
            }
        }
        else {
            return res.status(500).json('onAuth was not handled');
        }
    }
    removeOldAuth(oldAuthId) {
        if (oldAuthId) {
            const auth = this.authMap.get(oldAuthId);
            if (auth) {
                clearTimeout(auth.timeout);
                this.authMap.delete(oldAuthId);
                return true;
            }
        }
        return false;
    }
    addAuthToMap(oldAuthId, newAuthId, newAuthData, timeout) {
        timeout = timeout ? timeout : this.authTimeout;
        this.removeOldAuth(oldAuthId);
        this.authMap.set(newAuthId, {
            auth: newAuthData,
            timeout: setTimeout(() => {
                this.authMap.delete(newAuthId);
            }, timeout)
        });
    }
}
const Authentication = MasterServerListener_1.default(AuthenticationBase);
exports.default = Authentication;

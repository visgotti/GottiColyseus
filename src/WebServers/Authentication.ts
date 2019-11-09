import {generateId} from "../Util";

const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');

import { Messenger } from 'gotti-reqres/dist';

import { BaseWebServer } from "./Base";

import {
    GateProtocol,
    GOTTI_GATE_CHANNEL_PREFIX,
    GOTTI_GATE_AUTH_ID,
    GOTTI_AUTH_KEY,
    GOTTI_HTTP_ROUTES,
    GOTTI_ROUTE_BODY_PAYLOAD
} from "../Protocol";

type AuthMasterHandler = (message: any) => void;

import MasterServerListener from "../Mixins/MasterServerListener";

class AuthenticationBase extends BaseWebServer {
    public app: any;
    private server: any;

    private onAuthHandler: Function;
    private onRegisterHandler: Function;
    private onForgotPasswordHandler: Function;
    private masterServerURI: string;

    private onMasterMessageHandler: AuthMasterHandler;

    private onInitHandler: Function;
    readonly clientPath: string;
    private requester: Messenger;
    private reserveGateRequest: Function;
    readonly port: number;
    private authTimeout: number = 1000 * 60 * 60 * 12; // 12 hours
    private authMap: Map<string, any> = new Map();
    private dataHandler: any;

    readonly data: any = {};

    constructor(gateURI, port, app?, sessionTimeout?) {
        super();
        this.authTimeout = sessionTimeout ? sessionTimeout : this.authTimeout;
        this.port = port;
        this.requester = new Messenger({
            id: 'authentication_requester',
            brokerURI: gateURI,
            request: { timeout: 1000 }
        });
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
        this.authMap = new Map();
    }

    public async init(dataInitHandler?, masterURI?) {
        if(dataInitHandler) {
            const _data = await dataInitHandler();
            Object.keys(_data).forEach(key => {
                this.data[key] = _data[key];
            });
        }
        const reqName = GOTTI_GATE_CHANNEL_PREFIX + '-' + GateProtocol.RESERVE_AUTHENTICATION;
        this.requester.createRequest(reqName, 'gate_responder');
        this.reserveGateRequest = this.requester.requests[reqName].bind(this);
        this.app.post(`${GOTTI_HTTP_ROUTES.BASE_AUTH}${GOTTI_HTTP_ROUTES.AUTHENTICATE}`, this.onAuth.bind(this));
        this.app.post(`${GOTTI_HTTP_ROUTES.BASE_AUTH}${GOTTI_HTTP_ROUTES.REGISTER}`, this.onRegister.bind(this));
        return true;
    }

    public addOnMasterMessageHandler(handler) {
        this.onMasterMessageHandler = handler;
    }

    public addOnAuth(handler) {
        this.onAuthHandler = handler;
    }
    public addOnRegister(handler) {
        this.onRegisterHandler = handler;
    }

    private async setClientAuth(req, authObject) {
        const oldAuthId = req.body[GOTTI_GATE_AUTH_ID];
        const newAuthId = await this.reserveGateRequest({
            auth: authObject,
            oldAuthId
        });

        this.removeOldAuth(oldAuthId);

        req['GOTTI_AUTH'] = {
            [GOTTI_GATE_AUTH_ID]: newAuthId,
            [GOTTI_AUTH_KEY]: authObject
        };
        return authObject;
    }

    public addHandler(route, handler) {
        if(!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server')
        }
        this.app.post(route, async (req, res) => {
            const authId = req.body[GOTTI_GATE_AUTH_ID];
            const auth = this.authMap.get(authId);
            if(!auth) {
                return res.status(503).json({ error: 'not authenticated' });
            }
            return Promise.resolve(handler(req.body[GOTTI_ROUTE_BODY_PAYLOAD], auth)).then((responseObject) => {
                return res.json({ responseObject });
            }).catch(err => {
                return res.json({error: err})
            })
        })
    }

    private removeOldAuth(oldAuthId) {
        if(oldAuthId) {
            const old = this.authMap.get(oldAuthId);
            if(old) {
                clearTimeout(old.timeout);
                this.authMap.delete(oldAuthId);
                return true;
            }
        }
        return false;
    }
    public async onRegister(req, res) {
        if(this.onRegisterHandler) {
            try {
                const auth = await this.onRegisterHandler(req.body[GOTTI_AUTH_KEY], req);
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
                const oldAuthId = req.body[GOTTI_GATE_AUTH_ID];

                const auth = await this.onAuthHandler(req.body[GOTTI_AUTH_KEY], req);
                if(!auth) {
                    return res.send(503)
                }
                const authId = await this.reserveGateRequest({
                    auth,
                    oldAuthId
                });
                if(authId) {
                    if(oldAuthId) {
                        const old = this.authMap.get(oldAuthId);
                        if(old) {
                            clearTimeout(old.timeout);
                            this.authMap.delete(oldAuthId);
                        }
                    }
                    this.authMap.set(authId, {
                        auth,
                        timeout: setTimeout(() => {
                            this.authMap.delete(authId);
                        }, this.authTimeout)
                    });
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
const Authentication = MasterServerListener(AuthenticationBase);
export default Authentication;
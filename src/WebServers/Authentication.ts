import {httpErrorHandler} from "../Util";

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

    readonly data: any = {};

    private authApi: any;

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

    private makeRequestApi(req, authId) : { refreshAuth: (authId: string) => Promise<boolean>, updateAuth: (authId: string, newAuthData: any) => Promise<boolean>, getAuth: (authId: string) => Promise<any> } {
        return {
            refreshAuth: this.refreshAuth.bind(this, req, authId),
            updateAuth: this.updateAuth.bind(this, req, authId),
            getAuth: this.getAuth.bind(this)
        }
    }

    public addHandler(route, handler) {
        if(!this.app) {
            throw new Error('Cannot add route since theres no express server initialized on web server')
        }
        this.app.post(`${GOTTI_HTTP_ROUTES.BASE_AUTH}/${route}`, async (req, res) => {
            const authId = req.body[GOTTI_GATE_AUTH_ID];
            if(!authId) {
                return res.status(503).json('Not authenticated.');
            }
            const auth = this.authMap.get(authId);
            if(!auth) {
                return res.status(503).json('not authenticated');
            }
            try {
                return Promise.resolve(handler(req.body[GOTTI_ROUTE_BODY_PAYLOAD], auth.auth, this.makeRequestApi(req, authId))).then((responseObject) => {
                    const response = {[GOTTI_ROUTE_BODY_PAYLOAD]: responseObject };
                    if(req[GOTTI_AUTH_KEY]) response[GOTTI_AUTH_KEY] = req[GOTTI_AUTH_KEY];
                    if(req[GOTTI_GATE_AUTH_ID]) response[GOTTI_GATE_AUTH_ID] = req[GOTTI_GATE_AUTH_ID];
                    return res.json(response);
                });
            } catch(err) {
                return httpErrorHandler(res, err);
            }
        })
    }

    private getAuth(authId) {
        const auth = this.authMap.get(authId);
        if(auth) {
            return auth.auth;
        }
    }

    private async updateAuth(req, authId, newAuthData, timeout?) {
        try {
            const obj : any = {
                auth: newAuthData,
                oldAuthId: authId
            };
            if(timeout) {
                obj.timeout = timeout;
            };
            const newAuthId = await this.reserveGateRequest(obj);
            if(newAuthId) {
                this.addAuthToMap(authId, newAuthId, newAuthData);
                req[GOTTI_GATE_AUTH_ID] = newAuthId;
                req[GOTTI_AUTH_KEY] = newAuthData;
                return newAuthId;
            }
            return false;
        } catch(err) {
            return false;
        }
    }

    private async refreshAuth(req, authId, timeout?) {
        const oldAuth = this.authMap.get(authId);
        if(oldAuth) {
            try {
                const obj : any = {
                    refresh: true,
                    oldAuthId: authId
                };
                if(timeout) {
                  obj.timeout = timeout;
                };
                const newAuthId = await this.reserveGateRequest(obj);
                this.addAuthToMap(authId, newAuthId, oldAuth.auth);
                req[GOTTI_GATE_AUTH_ID] = newAuthId;
                return newAuthId;
            } catch (err) {
                return false;
            }
        } else {
            return false;
        }
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
                return httpErrorHandler(res, err);
            }
        } else {
            return res.send('onRegister was not handled');
        }
    }

    public async onAuth(req, res) {
        if(this.onAuthHandler) {
            try {
                const oldAuthId = req.body[GOTTI_GATE_AUTH_ID];
                const api =  this.makeRequestApi(req, null);
                // only need the getAuth for api in onAuth since the return value
                // is basically the same logic of both of these.
                delete api['refreshAuth'];
                delete api['updateAuth'];
                const auth = await this.onAuthHandler(req.body[GOTTI_AUTH_KEY], api, req);
                if(!auth) {
                    return res.sendStatus(503)
                }
                const authId = await this.reserveGateRequest({
                    auth,
                    oldAuthId
                });
                if(authId) {
                    this.addAuthToMap(oldAuthId, authId, auth);
                    return res.json({
                        [GOTTI_GATE_AUTH_ID]: authId,
                        [GOTTI_AUTH_KEY]: auth,
                    })
                } else {
                    return res.sendStatus(503)
                }
            } catch(err) {
                return httpErrorHandler(res, err);
            }
        } else {
            return res.status(500).json('onAuth was not handled');
        }
    }

    private removeOldAuth(oldAuthId) {
        if(oldAuthId) {
            const auth = this.authMap.get(oldAuthId);
            if(auth) {
                clearTimeout(auth.timeout);
                this.authMap.delete(oldAuthId);
                return true;
            }
        }
        return false;
    }
    private addAuthToMap(oldAuthId, newAuthId, newAuthData, timeout?) {
        timeout = timeout ? timeout : this.authTimeout;
        this.removeOldAuth(oldAuthId);
        this.authMap.set(newAuthId, {
            auth: newAuthData,
            timeout: setTimeout(() => {
                this.authMap.delete(newAuthId);
            }, timeout)
        })
    }
}
const Authentication = MasterServerListener(AuthenticationBase);
export default Authentication;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Gate {
    constructor(urls) {
        this.urls = [];
        this.urls = urls;
        this.gateKeep = this.gateKeep.bind(this);
    }
    registerGateKeep(handler) {
        this.onGateKeepHandler = handler;
        this.onGateKeepHandler = this.onGateKeepHandler.bind(this);
    }
    gateKeep(req, res) {
        if (this.onGateKeepHandler(req, res)) {
            res.status(200).json(this.urls);
        }
        else {
            res.status(401).json(this.urls);
        }
    }
}
exports.Gate = Gate;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gotti_pubsub_1 = require("gotti-pubsub");
function default_1(Base) {
    return class MasterServerGlobalListener extends Base {
        constructor(...args) {
            super(...args);
        }
        addGlobalMasterServerHandler(masterURI, handler, id) {
            this.masterListener = new gotti_pubsub_1.Messenger(id);
            this.masterListener.initializeSubscriber([masterURI.public]);
            this.masterListener.createSubscription(37 /* GLOBAL_MASTER_MESSAGE */.toString(), 37 /* GLOBAL_MASTER_MESSAGE */.toString(), handler.bind(this));
        }
    };
}
exports.default = default_1;

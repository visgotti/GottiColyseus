import {FrontChannel} from "gotti-channels/dist";


import { Messenger } from "gotti-pubsub";

import { Protocol } from "../Protocol";

type Constructor<T = any> = new (...args: any[]) => T;

export default function <TBase extends Constructor>(Base: TBase) {
    return class MasterServerGlobalListener extends Base {
        public masterServerURI: string;
        public masterServerChannel: FrontChannel;
        public masterListener: Messenger;
        constructor(...args: any[]) {
            super(...args);
        }
        public addGlobalMasterServerHandler(masterURI, handler, id) {
            this.masterListener = new Messenger(id);
            this.masterListener.initializeSubscriber([masterURI]);
            this.masterListener.createSubscription(Protocol.GLOBAL_MASTER_MESSAGE.toString(), Protocol.GLOBAL_MASTER_MESSAGE.toString(), handler.bind(this));
        }
    }
}
import { FrontChannel } from "gotti-channels/dist";
import { Messenger } from "gotti-pubsub";
import { ServerURI } from "../Connector";
declare type Constructor<T = any> = new (...args: any[]) => T;
export default function <TBase extends Constructor>(Base: TBase): {
    new (...args: any[]): {
        [x: string]: any;
        masterServerURI: ServerURI;
        masterServerChannel: FrontChannel;
        masterListener: Messenger;
        addGlobalMasterServerHandler(masterURI: ServerURI, handler: any, id: any): void;
    };
} & TBase;
export {};

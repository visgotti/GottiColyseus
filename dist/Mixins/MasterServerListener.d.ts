import { FrontChannel } from "gotti-channels/dist";
import { Messenger } from "gotti-pubsub";
declare type Constructor<T = any> = new (...args: any[]) => T;
export default function <TBase extends Constructor>(Base: TBase): {
    new (...args: any[]): {
        [x: string]: any;
        masterServerURI: string;
        masterServerChannel: FrontChannel;
        masterListener: Messenger;
        addGlobalMasterServerHandler(masterURI: any, handler: any, id: any): void;
    };
} & TBase;
export {};

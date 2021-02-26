// @ts-ignore
import http from "http";
import {Client as ChannelClient} from "gotti-channels/dist";

export interface IConnectorClient {
    state: 'open' | 'closed';
    removeAllListeners: (message: string) => void;
    close: (reason?: number) => void;
    on: (message: string, cb:(data:any) => void) => void;
    once: (message: string, cb:(data:any) => void) => void;
    send: (message: string | Buffer | Array<any>, opts?: { reliable?: boolean, ordered?: boolean, retryRate?: number, firstRetryRate?: number }) => void;
    sendReliable: (message: Array<any>, ordered: boolean, opts?: { retryRate?: number, firstRetryRate?: number }) => void;
    p2p_capable: boolean;
    p2p_enabled: boolean;
    playerIndex: number;
    upgradeReq?: http.IncomingMessage; // cross-compatibility for ws (v3.x+) and uws
    id: string;
    gottiId: string;
    options: any;
    sessionId: string;
    pingCount: number; // ping / pong
    joinedOptions?: any,
    joinOptions?: any,
    auth?: any; // custom data set through Room's verifyClient method.
    seatOptions?: any; //options sent from gate server when reserved seat
    channelClient: ChannelClient; // client that keeps track of channels/areas a client is interacting with
}

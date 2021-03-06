/**
 * Connector Client is the same thing as the regular colyseus client and has all the same functionality
 * with the additional 'centrumClient' object and its methods to communicate with the centrum back channels
 * which are aliased as 'Areas'
 */
import { Client as ChannelClient } from 'gotti-channels/dist';
import { generateId } from '../src/Util';
import * as WebSocket from 'ws';
import * as http from 'http';

// Export 'WebSocket' as 'Client' with 'id' property.
export type ConnectorClient = WebSocket & {
    upgradeReq?: http.IncomingMessage; // cross-compatibility for ws (v3.x+) and uws
    id: string;
    gottiId: string;
    options: any;
    sessionId: string;
    pingCount: number; // ping / pong
    auth?: any; // custom data set through Room's verifyClient method.
    seatOptions?: any; //options sent from gate server when reserved seat
    channelClient: ChannelClient; // client that keeps track of channels/areas a client is interacting with
};

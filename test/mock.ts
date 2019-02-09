import { Client as ChannelClient } from 'gotti-channels/dist';
import { Connector } from '../src/Connector';
import { AreaRoom } from '../src/AreaRoom';
import { AreaServer } from '../src/AreaServer';
import { generateId } from '../src/Util';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
const msgpack = require('notepack.io');


/*
export class DummyArea extends Area {

}
*/


export class Client extends EventEmitter {

    public gottiId: string;
    public messages: Array<any> = [];
    public readyState: number = WebSocket.OPEN;
    public channelClient: ChannelClient;

    constructor (connector: Connector) {
        super();
        this.gottiId = generateId();
        this.channelClient = new ChannelClient(this.gottiId, connector.masterChannel);
        this.once('close', () => {
            this.readyState = WebSocket.CLOSED
        });
    }

    send (message) {
        this.messages.push(message);
    }

    receive (message) {
        this.emit('message', msgpack.encode(message));
    }

    getMessageAt(index: number) {
        return msgpack.decode(this.messages[index]);
    }

    get lastMessage () {
        return this.getMessageAt(this.messages.length - 1);
    }

    close (code?: number) {
        this.readyState = WebSocket.CLOSED;
        this.emit('close');
    }
}

export function createDummyConnectorClient(connector): any {
    let client = new Client(connector);
    return client;
}
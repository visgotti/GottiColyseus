import { Client as ChannelClient } from 'gotti-channels/dist';
import { Connector } from '../src/Connector';
import { AreaRoom } from '../src/AreaRoom';
import { AreaServer } from '../src/AreaServer';
import { generateId } from '../src/Util';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
const msgpack = require('notepack.io');


export class DummyConnector extends Connector {
    constructor(options){
        super(options);
    }
    onAuth(options) {
        return true;
    };
    onAddedAreaListen(clientUid, areaId, options) {}
    onRemovedAreaListen(clientUid, areaId, options) {}
    onMessage(){}
}


export class AcceptAuthConnector extends Connector {
    constructor(options){
        super(options);
    }
    onAuth(options) {
        return true;
    };
    onAddedAreaListen(clientUid, areaId, options) {}
    onMessage(){}
}

export class DeclineAuthConnector extends Connector {
    constructor(options){
        super(options);
    }
    onAuth(options) {
        return false;
    };

    onMessage(){}
}

/*
export class DummyArea extends Area {

}
*/


export class Client extends EventEmitter {

    public id: string;
    public messages: Array<any> = [];
    public readyState: number = WebSocket.OPEN;
    public channelClient: ChannelClient;

    constructor (connector: Connector) {
        super();
        this.id = generateId();
        this.channelClient = new ChannelClient(this.id, connector.masterChannel);
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

export class AcceptsRequestsArea extends AreaRoom {
    constructor(id) {
        super(id);
    }
    requestWrite(clientId, options?) {
        const responseOptions = (!options) ? true : options;
        return responseOptions;
    }
    requestListen(clientId, options?) {
        const responseOptions = (!options) ? true : options;
        return responseOptions;
    }
    requestRemoveListen(clientId, options?) {
        const responseOptions = (!options) ? true : options;
        return responseOptions;
    }
    onMessage(clientId: string, message) {};
}

export class RejectsRequestsArea extends AreaRoom {
    constructor(id) {
        super(id)
    }
    requestWrite(clientId, options?) {
        return false;
    }
    requestListen(clientId, options?) {
        return false;
    }
    requestRemoveListen(clientId, options?) {
        return false;
    }
    onMessage(clientId: string, message) {};
}
import { BackChannel, BackMaster } from 'gotti-channels/dist';
import { Protocol } from './Protocol';

import { EventEmitter } from 'events';

import { AreaClient as Client } from './AreaClient';

const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)

export interface BroadcastOptions {
    except: Client;
}

export type SystemMessage = {
    type: number | string,
    data: any,
    to: Array<number | string>,
    from: number | string,
}

export type AreaToAreaSystemMessage = {
    type: number | string,
    data: any,
    to: Array<number | string>,
    from: number | string,
    toAreaIds: Array<number | string>,
}

export class AreaRoom extends EventEmitter {
    public publicOptions: any;
    readonly areaId: string | number;
    public patchRate: number = DEFAULT_PATCH_RATE;
    public gameLoopRate: number = DEFAULT_PATCH_RATE;
    public areaChannel: BackChannel;
    public masterChannel: BackMaster;
    public metadata: any = null;
    public clientsById: any = {};
    private _patchInterval: NodeJS.Timer;
    public state: any;
    private gottiProcess: any = null;

    constructor(gottiProcess: any, areaId, publicOptions?: any) {
        super();
        this.gottiProcess = gottiProcess;
        this.publicOptions = publicOptions;
        this.areaId = areaId;
        this.masterChannel = null;
        this.areaChannel = null;
        this.clientsById = {};
    }

    public initializeAndStart(masterChannel, areaChannel) {
        if(this.areaId !== areaChannel.channelId) {
            console.log('the area channel was', areaChannel.channelId);
            console.log('the area id was', this.areaId);
            throw 'Area Id and area channel id must be the same.'
        }
        this.areaChannel = areaChannel;
        this.masterChannel = masterChannel;
        this.registerBackChannelMessages();
        this.startGottiProcess();
    }

    private startGottiProcess() {

        this.gottiProcess.decorateSystemsWithNetworkFunctions(this);

        if(this.gottiProcess.clientManager.initialized) {
            throw 'Initializing client manager multiple times'
        }
        this.gottiProcess.clientManager.setClientWrite = (clientId, areaId, options?) => {
            this.masterChannel.messageClient(clientId, [Protocol.REQUEST_WRITE_AREA, areaId, options]);
        };

        this.gottiProcess.clientManager.removeClientListener = (clientId, options?) => {
            this.masterChannel.messageClient(clientId, [Protocol.REQUEST_REMOVE_LISTEN_AREA, this.areaId, options]);
        };

        this.gottiProcess.clientManager.setClientListen = (clientId, areaId, options?) => {
            this.masterChannel.messageClient(clientId, [Protocol.REQUEST_LISTEN_AREA, areaId, options]);
        };

        this.gottiProcess.clientManager.initialized = true;

        this.gottiProcess.startAllSystems();
        this.gottiProcess.startLoop(this.gameLoopRate);
    }

    // dispatches local message to server systems from room
    protected addMessage(message: SystemMessage) {
        this.gottiProcess.messageQueue.add(message);
    }

    protected addImmediateMessage(message: SystemMessage, isRemote: boolean) {
        this.gottiProcess.messageQueue.instantDispatch(message);
    }

    protected setState(state: any) {
        if(!this.areaChannel) {
            throw 'Please make sure the area channel has a channel attached before setting state.';
        }

        if(!(this.gottiProcess)) {
            throw 'Make sure the process was created before setting state'
        }
        this.areaChannel.setState(state);
        this.state = this.areaChannel.state;

        // adds state to all system globals property.
        this.gottiProcess.addGlobal(state);
    }

    /**
     * sends system message to all clients in the game.
     * @param message
     */
    public dispatchGlobalSystemMessage(message: SystemMessage): void {
        this.areaChannel.broadcast([Protocol.SYSTEM_MESSAGE, message]);
    }

    /**
     * sends system message to all clients who are listening to it
     * @param message
     */
    public dispatchLocalSystemMessage(message) {
        this.areaChannel.broadcastLinked([Protocol.SYSTEM_MESSAGE, message])
    }

    /**
     * sends system message to specific client.
     * @param client
     * @param message
     */
    public dispatchClientSystemMessage(client: Client, message: SystemMessage) {
        this.masterChannel.messageClient(client.id, [Protocol.SYSTEM_MESSAGE, message.type, message.data, message.to, message.from]);
    }

    public dispatchSystemMessageToAreas(areaIds: Array<string>, message: SystemMessage) {
        this.areaChannel.sendMainFront([Protocol.AREA_TO_AREA_SYSTEM_MESSAGE, message.type, message.data, message.to, message.from, areaIds])
    }

    private _onConnectorMessage() {};
    private _onMessage(clientId, message) {};
    private _onGlobalMessage(clientId, message) {};

    private registerBackChannelMessages() {
        this.areaChannel.onAddClientListen(this.gottiProcess.clientManager.onClientRequestListen.bind(this.gottiProcess.clientManager));

        this.areaChannel.onMessage((message) => {
            if (message[0] === Protocol.AREA_DATA) {
                //    this.onMessage();
            } else if (message[0] === Protocol.AREA_TO_AREA_SYSTEM_MESSAGE) {
              //  this.onMessage(message[1]);
            }
        });

        // get the add remote call reference from gottiProcess's message queue.
        const messageQueueRemoteDispatch = this.gottiProcess.messageQueue.addRemote.bind(this.gottiProcess.messageQueue);
        const messageQueueInstantRemoteDispatch = this.gottiProcess.messageQueue.instantDispatch.bind(this.gottiProcess.messageQueue);

        this.areaChannel.onClientMessage((clientId, message) => {
            if (message[0] === Protocol.AREA_DATA) {
                //    this.onMessage();
            } else if (message[0] === Protocol.SYSTEM_MESSAGE) {
                messageQueueRemoteDispatch(message[1], message[2], message[3], message[4]);
            } else if (message[0] === Protocol.IMMEDIATE_SYSTEM_MESSAGE) {
                messageQueueInstantRemoteDispatch({ type: message[1], data: message[2], to: message[3], from: message[4] }, true);
            } else if (message[0] === Protocol.REQUEST_WRITE_AREA) {
                // [protocol, areaId, options]
                const write = this.gottiProcess.clientManager.onClientRequestWrite(clientId, message[1], message[2]);
                if(write) {
                    this.gottiProcess.clientManager.setClientWrite(clientId, message[1], write)
                }
            } else if (message[0] === Protocol.REQUEST_REMOVE_LISTEN_AREA) {
                const removed = this.gottiProcess.clientManager(clientId, message[1]);
                if(removed) {
                    this.gottiProcess.clientManager.removeClientListener(clientId, removed);
                }
            }
        });

        this.areaChannel.onAddClientWrite.bind(this.gottiProcess.clientManager.onClientWrite.bind(this.gottiProcess));
        this.areaChannel.onRemoveClientWrite.bind(this.gottiProcess.clientManager.onClientRemoveWrite.bind(this.gottiProcess));
        this.areaChannel.onAddClientListen.bind(this.gottiProcess.clientManager.onClientListen.bind(this.gottiProcess));
        this.areaChannel.onRemoveClientListen.bind(this.gottiProcess.clientManager.onClientRemoveListen.bind(this.gottiProcess));
    }

}

import { BackChannel, BackMaster } from 'gotti-channels/dist';
import { Protocol } from './Protocol';

import { EventEmitter } from 'events';
const msgpack = require('notepack.io');

import { AreaClient as Client } from './AreaClient';

const DEFAULT_PATCH_RATE = 1000 / 20; // 20fps (50ms)

export enum LISTEN_REQUEST_FROM {
    SERVER,
    CLIENT,
}

export interface BroadcastOptions {
    except: Client;
}

export type SystemMessage = {
    type: number | string,
    data: any,
    to: number | string,
}

export type AreaToAreaSystemMessage = {
    type: number | string,
    data: any,
    to: Array<number | string>,
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

    private writingClientIds: Set<any> = new Set();
    private listeningClientIds: Set<any> = new Set();

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
            throw 'Area Id and area channel id must be the same.'
        }
        this.areaChannel = areaChannel;
        this.masterChannel = masterChannel;
        this.registerBackChannelMessages();
        this.startGottiProcess();
    }

    private startGottiProcess() {
        this.gottiProcess.clientManager.setClientWrite = (clientId, areaId, options?) => {
            this.masterChannel.messageClient(clientId, [Protocol.SET_CLIENT_AREA_WRITE, areaId, options]);
        };
        this.gottiProcess.clientManager.removeClientListener = (clientId, options?) => {
            this.masterChannel.messageClient(clientId, [Protocol.REMOVE_CLIENT_AREA_LISTEN, this.areaId, options]);
        };
        this.gottiProcess.clientManager.addClientListener = (clientId, areaId, options?) => {
            this.masterChannel.messageClient(clientId, [Protocol.ADD_CLIENT_AREA_LISTEN, areaId, options]);
        };
        this.gottiProcess.addRoom(this);
        this.gottiProcess.startAllSystems();
        this.gottiProcess.startLoop();
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
    public dispatchToAllClients(message: SystemMessage): void {
        this.areaChannel.broadcast([Protocol.SYSTEM_MESSAGE, message.type, message.data, message.to ]);
    }

    /**
     * sends system message to all clients who are listening to it
     * @param message
     */
    public dispatchToLocalClients(message: SystemMessage) {
        this.areaChannel.broadcastLinked([Protocol.SYSTEM_MESSAGE,  message.type, message.data, message.to]);
    }

    public dispatchToLocalClientsSpecified(message: SystemMessage, clientIds: Array<string>) {
        const encoded = msgpack.encode([Protocol.SYSTEM_MESSAGE, message.to, message.type, message.data]);
        this.areaChannel.broadcastLinked([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES, encoded, ...clientIds])
    }

    /**
     * sends system message to specific client.
     * @param client
     * @param message
     */
    public dispatchToClient(clientId: string, message: SystemMessage) {
        this.masterChannel.messageClient(clientId, [Protocol.SYSTEM_MESSAGE, message.type, message.data, message.to]);
    }

    public dispatchToClients(clientIds: Array<string>, message: SystemMessage) {
        this.masterChannel.messageClients(clientIds, [Protocol.SYSTEM_MESSAGE, message.type, message.data, message.to]);
    }

    public dispatchToAreas(message: SystemMessage, areaIds?: Array<string>) {
        this.areaChannel.sendMainFront([Protocol.AREA_TO_AREA_SYSTEM_MESSAGE, message.type, message.data, message.to, areaIds])
    }

    public dispatchToMaster(message: any) {
        this.areaChannel.sendMainFront([Protocol.AREA_TO_MASTER_MESSAGE, message]);
    }

    private _onConnectorMessage() {};
    private _onMessage(clientId, message) {};
    private _onGlobalMessage(clientId, message) {};

    private registerBackChannelMessages() {
        this.areaChannel.onMessage((message) => {
            if (message[0] === Protocol.AREA_DATA) {
                //    this.onMessage();
            } else if (message[0] === Protocol.AREA_TO_AREA_SYSTEM_MESSAGE) {
                // [ protocol, type, data, to, fromAreaId]
                this.gottiProcess.messageQueue.addAreaMessage(message[4], {
                    type: message[1],
                    data: message[2],
                    to: message[3],
                });
              //  this.onMessage(message[1]);
            } else if (message[0] === Protocol.MASTER_TO_AREA_BROADCAST) {
                this.gottiProcess.messageQueue.addMasterMessage(message[1]);
            }
        });

        // get the add remote call reference from gottiProcess's message queue.
        const messageQueueClientDispatch = this.gottiProcess.messageQueue.addClientMessage.bind(this.gottiProcess.messageQueue);
        const messageQueueInstantClientDispatch = this.gottiProcess.messageQueue.instantClientDispatch.bind(this.gottiProcess.messageQueue);

        const clientManager = this.gottiProcess.clientManager;

        clientManager.listeningClientIds = this.listeningClientIds;
        clientManager.writingClientIds = this.writingClientIds;

        this.areaChannel.onClientMessage((clientId, message) => {
            const protocol = message[0];
            if (protocol === Protocol.AREA_DATA) {
                //    this.onMessage();
            } else if (protocol === Protocol.SYSTEM_MESSAGE) {
                messageQueueClientDispatch(clientId, { type: message[1], data: message[2], to: message[3]});
            } else if (protocol === Protocol.IMMEDIATE_SYSTEM_MESSAGE) {
                messageQueueInstantClientDispatch(clientId, { type: message[1], data: message[2], to: message[3] });
            }
        });

        this.areaChannel.onAddClientListen((clientUid, options) => {
                return options || true;
        });

        this.areaChannel.onAddedClientListener((clientId: any, options?: any) => {
            this.listeningClientIds.add(clientId);
            clientManager.onClientListen(clientId, options);
        });
        this.areaChannel.onAddClientWrite((clientId: any, options?: any) => {
            this.writingClientIds.add(clientId);
            clientManager.onClientWrite(clientId, options)
        });
        this.areaChannel.onRemoveClientWrite((clientId: any, options? : any) => {
            this.writingClientIds.delete(clientId);
            clientManager.onClientRemoveWrite(clientId, options);
        });
        this.areaChannel.onRemoveClientListen((clientId: any, options? : any) => {
            this.listeningClientIds.delete(clientId);
            clientManager.onClientRemoveListen()
        });
    }
}

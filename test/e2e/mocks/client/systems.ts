import { ClientSystem } from 'gotti';
export const system_names = ['MOCK_SYSTEM_1', 'MOCK_SYSTEM_2', 'MOCK_SYSTEM_3'];
export class DummySystem1 extends ClientSystem {
    constructor() {
        super(system_names[0]);
    }
    public returnName() {
        return this.name;
    }
    public onLocalMessage(message) {};
    public onServerMessage(message) {};
    public onInit() {};
    public onStop() {};
    public onStart() {};
    public update() {};
    public onStateUpdate(pathString, pathData, change, value) {};
    public onMessage(message) {};
    public onComponentAdded(entity) {};
    public onComponentRemoved(entity) {};
    public onPeerMessage(peerId: number | string, message: any) {}
    public onPeerConnectionRejected(peerId, options?) {};
    public onPeerConnectionRequested(peerId, options?) {};

    public onClear() {};
}

export class DummySystem2 extends ClientSystem {
    constructor() {
        super(system_names[1]);
    }
    public onLocalMessage(message) {};
    public onServerMessage(message) {};
    public onInit() {};
    public onStop() {};
    public onStart() {};
    public update() {};
    public onStateUpdate(pathString, pathData, change, value) {};
    public onMessage(message) {};
    public onComponentAdded(entity) {};
    public onComponentRemoved(entity) {};
    public onPeerMessage(peerId: number | string, message: any) {}
    public onPeerConnectionRejected(peerId, options?) {};
    public onPeerConnectionRequested(peerId, options?) {};

    public onClear() {};
}

export class DummySystem3 extends ClientSystem {
    constructor() {
        super(system_names[2]);
    }
    public onLocalMessage(message) {};
    public onServerMessage(message) {};
    public onInit() {};
    public onStop() {};
    public onStart() {};
    public update() {};
    public onStateUpdate(pathString, pathData, change, value) {};
    public onMessage(message) {};
    public onComponentAdded(entity) {};
    public onComponentRemoved(entity) {};
    public onPeerMessage(peerId: number | string, message: any) {}
    public onPeerConnectionRejected(peerId, options?) {};
    public onPeerConnectionRequested(peerId, options?) {};

    public onClear() {};
}

export class DummySystem4 extends ClientSystem {
    constructor() {
        super('DummySystem4');
    }
    public onLocalMessage(message) {};
    public onServerMessage(message) {};
    public onInit() {};
    public onStop() {};
    public onStart() {};
    public update() {};
    public onStateUpdate(pathString, pathData, change, value) {};
    public onMessage(message) {};
    public onComponentAdded(entity) {};
    public onComponentRemoved(entity) {};
    public onPeerMessage(peerId: number | string, message: any) {}
    public onPeerConnectionRejected(peerId, options?) {};
    public onPeerConnectionRequested(peerId, options?) {};

    public onClear() {};
}
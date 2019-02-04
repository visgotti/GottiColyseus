import { Connector } from '../../../src';

export default class MockConnector extends Connector {
    constructor(options){
        super(options);
    }
    onAuth(options) {
        return true;
    };
    onAddedAreaListen(clientUid, areaId, options) {}
    onMessage(){}
    onRemovedAreaListen() {}
    onChangedAreaWrite() {}
}
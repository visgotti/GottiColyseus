import { Connector } from '../../../src';

export default class DeclineAuthConnector extends Connector {
    constructor(options){
        super(options);
    }
    onAuth(options) {
        return false;
    };

    onMessage(){}
    onRemovedAreaListen() {}
}
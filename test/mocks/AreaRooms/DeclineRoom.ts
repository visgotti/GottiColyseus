import { AreaRoom } from '../../../src';

export default class RejectsRequestsArea extends AreaRoom {
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
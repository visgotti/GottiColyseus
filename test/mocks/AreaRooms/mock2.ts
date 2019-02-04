import { AreaRoom } from '../../../src';

export default class MockArea2 extends AreaRoom {
    constructor(id) {
        super(id);
    }
    requestWrite(clientId, areaId, options?) {
        console.log('options were', options);
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
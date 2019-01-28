const { AreaRoom } = require('../../dist');


module.exports = class ExampleAreaRoom extends AreaRoom {
    constructor(areaId, options) {
        super(areaId, options)
    }

    onMessage(clientId, message) {
        console.log('got message from', clientId);
    }

    requestWrite(clientId, areaId, options) {
        console.log('got write request from', clientId);
        console.log('area id ', areaId);
        console.log('options', options);
    }
};
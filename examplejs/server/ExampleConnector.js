const { Connector } = require('../../dist');

module.exports = class ExampleConnector extends Connector {
    constructor(options) {
        super(options)
    }

    onMessage(client, message) {
    }

    onJoin(client, options, auth) {
        console.log('client joined', client);
        console.log('options', options);
        console.log('auth was', auth);
    }
    requestJoin(options, isNew) {
        console.log('EXAMPLE requestJoin connector---');
        console.log('request was', options);
        console.log('is new was', options);
    }
};
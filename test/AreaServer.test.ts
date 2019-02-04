import { AreaServer } from '../src/AreaServer';

//import { AcceptsRequestsArea, RejectsRequestsArea } from './mock';
import * as http from 'http';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';

const connector_1_uri = 'tcp://127.0.0.1:4000';
const connector_2_uri = 'tcp://127.0.0.1:4001';

const area_1_uri = 'tcp://127.0.0.1:5000';
const area_2_uri = 'tcp://127.0.0.1:5001';

describe('AreaServer', () => {

    let server;

    beforeEach('constructs an area server', (done) => {
        const area1Options = {
            constructorPath: '/test/AreaRooms/mockArea',
          //  RoomConstructor: AcceptsRequestsArea,
            id: 'accepts',
        };

        const area2Options = {
            constructorPath: '/test/AreaRooms/mockArea',
            id: 'rejects',
        };

        const serverOptions = {
            serverIndex: 0,
            areas: [ area1Options, area2Options],
            connectorURIs: [connector_1_uri, connector_2_uri],
            areaURI: area_1_uri,
        };

        server = new AreaServer(serverOptions);
        assert.ok(server);
        setTimeout(() => {
            done();
        }, 500);
    });

    afterEach('resets area server', done => {
        server.disconnect();
        done();
    });

    it('initialized area server with correct areas', (done) => {
        assert.ok(server.areas['accepts']);
        assert.ok(server.areas['accepts']);
        done();
    });

});

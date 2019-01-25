const msgpack = require('notepack.io');
import { AreaServer } from '../src/AreaServer';
import { Protocol } from '../src/Protocol';
import { AcceptsRequestsArea, RejectsRequestsArea, DummyConnector, createDummyConnectorClient } from './mock';
import * as http from 'http';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';

const connector_1_uri = 'tcp://127.0.0.1:4000';
const connector_2_uri = 'tcp://127.0.0.1:4001';

const area_1_uri = 'tcp://127.0.0.1:5000';
const area_2_uri = 'tcp://127.0.0.1:5001';

describe('Area and Connector Integration tests', () => {

    let areaServer1 = null;
    let areaServer2 = null;

    let acceptRoom1 = null;
    let rejectRoom1 = null;

    let acceptRoom2 = null;
    let rejectRoom2 = null;

    let connector1 = null;
    let connector2 = null;

    let mockConnector1Options = {} as any;
    let mockConnector2Options = {} as any;

    let client1;
    let client2;

    before('constructs two connector servers and two area servers with 2 areas each and 2 clients.', (done) => {
        const acceptRoom1Options = {
            RoomConstructor: AcceptsRequestsArea,
            id: 'accept1',
        };

        const rejectRoom1Options = {
            RoomConstructor: RejectsRequestsArea,
            id: 'reject1',
        };

        const acceptRoom2Options = {
            RoomConstructor: AcceptsRequestsArea,
            id: 'accept2',
        };

        const rejectRoom2Options = {
            RoomConstructor: RejectsRequestsArea,
            id: 'reject2',
        };

        const area1ServerOptions = {
            serverIndex: 0,
            areas: [ acceptRoom1Options, rejectRoom1Options],
            connectorURIs: [connector_1_uri, connector_2_uri],
            areaURI: area_1_uri,
        };

        const area2ServerOptions = {
            serverIndex: 1,
            areas: [ acceptRoom2Options, rejectRoom2Options],
            connectorURIs: [connector_1_uri, connector_2_uri],
            areaURI: area_2_uri,
        };
        areaServer1 = new AreaServer(area1ServerOptions);
        acceptRoom1 = areaServer1.areas['accept1'];
        rejectRoom1 = areaServer1.areas['reject1'];

        areaServer2 = new AreaServer(area2ServerOptions);
        acceptRoom2 = areaServer2.areas['accept2'];
        rejectRoom2 = areaServer2.areas['reject2'];

        assert.ok(areaServer1);
        assert.ok(acceptRoom1);
        assert.ok(rejectRoom1);

        assert.ok(areaServer2);
        assert.ok(rejectRoom2);
        assert.ok(rejectRoom2);

        mockConnector1Options = {
            server: http.createServer(),
            roomId: 'test',
            serverIndex: 2,
            masterURI: connector_1_uri,
            channelIds: ['accept1', 'accept2', 'reject1', 'reject2'],
            areaURIs: [area_1_uri, area_2_uri]
        };

        mockConnector2Options = {
            server: http.createServer(),
            roomId: 'test',
            serverIndex: 3,
            masterURI: connector_2_uri,
            channelIds: ['accept1', 'accept2', 'reject1', 'reject2'],
            areaURIs: [area_1_uri, area_2_uri]
        };

        mockConnector1Options.server.listen(8082);
        mockConnector2Options.server.listen(8083);

        connector1 = new DummyConnector(mockConnector1Options);
        connector2 = new DummyConnector(mockConnector2Options);
        assert.ok(connector1);
        assert.ok(connector2);

        setTimeout(() => {
            Promise.all([connector1.connectToAreas(), connector2.connectToAreas()]).then((values) => {
                assert.ok(values[0]);
                assert.ok(values[1]);
                client1 = createDummyConnectorClient(connector1);
                client2 = createDummyConnectorClient(connector2);

                done();
            });
        }, 500);
    });

    describe('handles client listen requests correctly', () => {
        let onAddClientListenHandlerAccept1Spy;
        let onAddClientListenHandlerReject1Spy;
        let onAddedAreaListenAccept1Spy;

        before('client1 joins connector1 then makes listen requests to accept1 and reject1', (done) => {

            onAddClientListenHandlerAccept1Spy = sinon.spy(acceptRoom1.areaChannel, 'onAddClientListenHandler');
            onAddClientListenHandlerReject1Spy = sinon.spy(rejectRoom1.areaChannel, 'onAddClientListenHandler');

            onAddedAreaListenAccept1Spy = sinon.spy(connector1, 'onAddedAreaListen');

            connector1.emit('connection', client1, { auth: true, options: true });
            const message = [Protocol.REQUEST_LISTEN_AREA, 'accept1', { foo: 'bar' }];
            const encoded = msgpack.encode(message);
            // throws because client didnt set a write channel
            client1.emit('message', encoded);

            const message2 = [Protocol.REQUEST_LISTEN_AREA, 'reject1', { foo: 'bar' }];
            const encoded2 = msgpack.encode(message2);
            client1.emit('message', encoded2);
            done();
        });

        it('accepts listen', (done) => {
            sinon.assert.calledOnce(onAddClientListenHandlerAccept1Spy);
            assert.ok(onAddClientListenHandlerAccept1Spy.returned({ foo: 'bar' }));
            assert.ok(client1.id in acceptRoom1.clientsById);
            assert.deepStrictEqual(acceptRoom1.clientsById[client1.id].options, { foo: 'bar'});

            setTimeout(() => {
                assert.ok(client1.channelClient.isLinkedToChannel('accept1'));
                sinon.assert.calledOnce(onAddedAreaListenAccept1Spy);
                done();
            }, 20);
        });

        it('rejects listen', (done) => {
            sinon.assert.calledOnce(onAddClientListenHandlerReject1Spy);
            assert.ok(onAddClientListenHandlerReject1Spy.returned(false));
            assert.ok(!(client1.id in rejectRoom1.clientsById));
            done();
        });
    });
});

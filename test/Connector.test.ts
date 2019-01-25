const msgpack = require('notepack.io');
import { Protocol } from '../src/Protocol';
import { BackMaster } from 'gotti-channels/dist';
import { AcceptAuthConnector, DeclineAuthConnector, createDummyConnectorClient } from './mock';
import * as http from 'http';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';

const connector_1_uri = 'tcp://127.0.0.1:4000';
const connector_2_uri = 'tcp://127.0.0.1:4001';

const area_1_uri = 'tcp://127.0.0.1:5000';
const area_2_uri = 'tcp://127.0.0.1:5001';


describe('Connector', () => {
    let connector1 = null;
    let connector2 = null;
    let mockConnector1Options = {} as any;
    let mockConnector2Options = {} as any;
    let backMaster1;
    let backMaster2;

    let client1;
    let client2;

    before((done) => {
        mockConnector1Options = {
            server: http.createServer(),
            roomId: 'test',
            serverIndex: 0,
            masterURI: connector_1_uri,
            channelIds: [0, 1, 2, 3],
            areaURIs: [area_1_uri, area_2_uri]
        };
        mockConnector2Options = {
            server: http.createServer(),
            roomId: 'test',
            serverIndex: 1,
            masterURI: connector_2_uri,
            channelIds: [0, 1, 2, 3],
            areaURIs: [area_1_uri, area_2_uri]
        };
        mockConnector1Options.server.listen(8080);
        mockConnector2Options.server.listen(8081);

        backMaster1 = new BackMaster(2);
        backMaster1.initialize(area_1_uri, [connector_1_uri, connector_2_uri]);
        backMaster1.addChannels([0, 1]);

        backMaster2 = new BackMaster(3);
        backMaster2.initialize(area_2_uri, [connector_1_uri, connector_2_uri]);
        backMaster2.addChannels([2, 3]);
        setTimeout(() => {
            done();
        }, 500);
    });

    afterEach((done) => {
        mockConnector1Options.server.removeAllListeners();
        mockConnector2Options.server.removeAllListeners();
        setTimeout(() => {
           done();
        }, 500);
    });

    after((done) => {
      backMaster1.disconnect();
      backMaster2.disconnect();
      backMaster1 = null;
      backMaster2 = null;

      if(connector1) {
          connector1.masterChannel.disconnect();
      }
      if(connector2) {
          connector2.masterChannel.disconnect();
      }
      done();
    });

    describe('constructor', () => {
        it('constructs', (done) => {
            connector1 = new AcceptAuthConnector(mockConnector1Options);
            assert.strictEqual(connector1.roomId, mockConnector1Options.roomId);
            done();
        });
    });

    describe('connector.connectToAreas', () => {
       it('listens for websocket port and does channel handshake', (done) => {
           connector1 = new AcceptAuthConnector(mockConnector1Options);
           setTimeout(() => {
               connector1.connectToAreas().then(res => {
                   assert.ok(res);
                   done();
               })
           }, 500);
       });
    });

    describe('Client connects', () => {
        it('', (done) => {
            client1 = createDummyConnectorClient(connector1);
            assert.ok(client1);
            done();
        });
    });

    describe("connection event", () =>{
        it('handles client connection correctly when onAuth accepts' , (done) => {
            const onJoinSpy = sinon.spy(connector1, '_onJoin');
            const onAuthSpy = sinon.spy(connector1, 'onAuth');

            connector1.emit('connection', client1, { auth: true, options: true });
            sinon.assert.calledOnce(onAuthSpy);
            assert.ok(onAuthSpy.returned(true));

            sinon.assert.calledOnce(onJoinSpy);
            assert.ok(client1.channelClient);

            assert.ok(connector1.clients.length === 1);
            assert.ok(connector1.clientsById[client1.id]);

            done();
        });
    });

    describe('handles client protocols correctly', () => {
       it('Protocol.SYSTEM_MESSAGE', (done) => {
           const clientSendLocalSpy = sinon.spy(client1.channelClient, 'sendLocal');
           const message = [Protocol.SYSTEM_MESSAGE, 'test'];
           const encoded = msgpack.encode(message);
           // throws because client didnt set a write channel
           assert.throws(() => { client1.emit('message', encoded) } );
           sinon.assert.calledOnce(clientSendLocalSpy);
           done();
       });
    });

    describe('handles client protocols correctly', () => {
        it('Protocol.REQUEST_LISTEN_AREA', (done) => {
            const _requestAreaListenSpy = sinon.spy(connector1, '_requestAreaListen');
            const message = [Protocol.REQUEST_LISTEN_AREA];
            const encoded = msgpack.encode(message);
            // throws because client didnt set a write channel
            client1.emit('message', encoded);
            sinon.assert.calledOnce(_requestAreaListenSpy);
            done();
        });
    });

    describe('handles client protocols correctly', () => {
        it('Protocol.REQUEST_REMOVE_LISTEN_AREA', (done) => {
            const _requestRemoveAreaListenSpy = sinon.spy(connector1, '_requestRemoveAreaListen');
            const message = [Protocol.REQUEST_REMOVE_LISTEN_AREA];
            const encoded = msgpack.encode(message);
            // throws because client didnt set a write channel
            client1.emit('message', encoded);
            sinon.assert.calledOnce(_requestRemoveAreaListenSpy);
            done();
        });
    });

    describe('handles client protocols correctly', () => {
        it('Protocol.REQUEST_WRITE_AREA', (done) => {
            const _requestAreaWriteSpy = sinon.spy(connector1, '_requestAreaWrite');
            const message = [Protocol.REQUEST_WRITE_AREA];
            const encoded = msgpack.encode(message);
            // throws because client didnt set a write channel
            client1.emit('message', encoded);
            sinon.assert.calledOnce(_requestAreaWriteSpy);
            done();
        });
    });
});

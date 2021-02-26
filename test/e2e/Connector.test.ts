import {
    AUTH_PORT,
    CONNECTOR_CLIENT_PORT,
    CONNECTOR_SERVER_PORT,
    GATE_CLIENT_PORT,
    GATE_SERVER_PORT,
    LOCAL_HOST,
    makeURI,
    makeURL
} from "../mock";
import * as assert from 'assert';
import * as mocha from 'mocha';
import {Proxy} from '../../src/Proxy';
import {Client} from 'gotti';
import {clientProcess} from './mocks/client/process';
import {AuthWebServer, ConnectorOptions, GateWebServer} from "../../src";
import {MockConnector} from './mocks/server/Connector';
import {createGate} from "../mocks/gate/DummyGate";
import {WebRTCConnectorClient} from "../../src/ConnectorClients/WebRTC";
import {WebSocketConnectorClient} from "../../src/ConnectorClients/WebSocket";
import {WebRTCConnection} from "gotti/lib/core/WebClient/ConnectorServerConnections";

import * as msgpackDecode from 'notepack.io/browser/decode';
import {Protocol} from "../../src/Protocol";

require('../setup');

const opts : ConnectorOptions = () => {
    return {
        server: 'http',
        port: CONNECTOR_CLIENT_PORT,
        serverIndex: 1,
        connectorURI: makeURI(CONNECTOR_SERVER_PORT),
        gameData: {},
        gateURI: makeURI(GATE_SERVER_PORT),
        areaRoomIds: [],
        areaServerURIs: [],
    }
}
let playerClient;
let connector;
let gate : GateWebServer;
let proxy;
let auth;
const msgpack = require('notepack.io');

const mockGameData = () => {
    return { gameId: 'test1', gameType: 'test', gameData: { mock: 'data'}, areaData: {}, publicOptions: { 'test': 'public_options'} }
}
describe('E2E Connector tests', () => {
    beforeEach('Inits the servers, authenticates, and joins test game.', async () => {
        proxy = new Proxy(makeURL(AUTH_PORT), makeURL(GATE_CLIENT_PORT), [makeURL(1010)], 80, [{ proxyId: 'connector', port: CONNECTOR_CLIENT_PORT, host: LOCAL_HOST }])
        auth = new AuthWebServer(makeURI(GATE_SERVER_PORT), AUTH_PORT);
        connector = new MockConnector(opts())
        gate = createGate(makeURI(GATE_SERVER_PORT).public, GATE_CLIENT_PORT, [{ serverIndex: 1, host: LOCAL_HOST, port: CONNECTOR_CLIENT_PORT, proxyId: 'connector'}], mockGameData())
        await auth.init();
        await gate.init();
        gate.gate.defineMatchMaker('test', () => 'test1');
        await proxy.init();
        await connector.connectToAreas();
        assert(!!proxy);
        assert(!!gate.gate);
        assert(!!auth);
        assert(!!connector);
        auth.addOnAuth(() => true);
        playerClient = new Client([clientProcess], 'localhost', false, 'http', 80);
        await playerClient.authenticate();
        await playerClient.joinGame('test');
    })

    it('tests webrtc connects', (done) => {
        assert(connector.clientsById[playerClient.connector.gottiId] instanceof WebSocketConnectorClient)
        let webRtcClient;
        setTimeout(() => {
            assert(playerClient.connector.gottiId in connector.awaitingWebRTCConnections);
            webRtcClient = connector.awaitingWebRTCConnections[playerClient.connector.gottiId];
            assert.notStrictEqual(webRtcClient, connector.clientsById[playerClient.connector.gottiId] )
        }, 1)
        connector.on('webrtc-connection', (newWebRTCClient) => {
            assert(!!webRtcClient);
            assert(webRtcClient.state === 'open')
            assert(!(playerClient.connector.gottiId in connector.awaitingWebRTCConnections));
            assert.strictEqual(newWebRTCClient, connector.clientsById[playerClient.connector.gottiId] )
            assert.strictEqual(webRtcClient, newWebRTCClient);
            assert(connector.clientsById[playerClient.connector.gottiId] instanceof WebRTCConnectorClient)
            done();
        });
    });

    describe('webrtc messaging after connected', () => {
        let webRtcServerClient : WebRTCConnectorClient;
        let clientConnection : WebRTCConnection
        beforeEach((done) => {
            connector.on('webrtc-connection', (newWebRTCClient) => {
                webRtcServerClient = newWebRTCClient;
                clientConnection = playerClient.connector.serverConnection
                assert(connector.clientsById[playerClient.connector.gottiId] === newWebRTCClient);
                assert(newWebRTCClient instanceof WebRTCConnectorClient)
                setTimeout(() => {
                    done();
                }, 250);
            });
        })
        it('sends from server to client packets', (done) => {
            clientConnection = playerClient.connector.serverConnection
            assert(clientConnection instanceof WebRTCConnection)
            const sent = msgpack.encode({'test': 'data' });
            webRtcServerClient.send(sent);
            playerClient.connector.serverConnection.dataChannel.onmessage = ((received => {
                const decoded = msgpackDecode(new Uint8Array(received.data));
                assert.deepStrictEqual(decoded, {'test': 'data' })
                done();
            }))
            assert(true)
           // done();
         //   webRtcServerClient.send(sent);
        })
        //todo: idk if this fails because running locally has no packet loss or because of misconfiguration
        /*
        it('packets send unordered', (done) => {
            clientConnection = playerClient.connector.serverConnection
            assert(clientConnection instanceof WebRTCConnection)
            const sendCount = 150000;
            let prevReceived = -1;
            let receivedInOrder = 0;
            playerClient.connector.serverConnection.onMessage((received => {
                const decoded = msgpackDecode(new Uint8Array(received.data));
                if(decoded - prevReceived !== 1) {
                    playerClient.connector.serverConnection.onMessage(() => {});
                    done();
                } else {
                    receivedInOrder++;
                    if(receivedInOrder === 150000) {
                        throw new Error(`All messaged received in order of sent.`)
                    }
                    prevReceived = decoded;
                }
            }))
            for(let i = 0; i < sendCount; i++) {
                webRtcServerClient.send(msgpack.encode(i));
            }
        }).timeout(3000)
         */

        it('packets send ordered and strips the sequence when it reaches the connector callback', (done) => {
            const reliableOrderProtocols = [Protocol.SYSTEM_MESSAGE_RELIABLE_ORDERED, Protocol.IMMEDIATE_SYSTEM_MESSAGE_RELIABLE_ORDERED, Protocol.SYSTEM_MESSAGE_RELIABLE_ORDERED]
            clientConnection = playerClient.connector.serverConnection
            assert(clientConnection instanceof WebRTCConnection)
            let receivedCount  = 0;
            let preReceivedCount = 0;
            playerClient.connector.onMessageCallback = ((decoded) => {
                assert(decoded.length === 1);
                assert.strictEqual(decoded[0], reliableOrderProtocols[receivedCount]);
                receivedCount++;
                assert.strictEqual(clientConnection['sentReliableAckSequences'].length, 0);
                assert.strictEqual(clientConnection['sentOrderedAckSequences'].length, receivedCount);
                if(receivedCount === reliableOrderProtocols.length) {
                    assert.strictEqual(preReceivedCount, receivedCount);
                    assert.deepStrictEqual(clientConnection['sentOrderedAckSequences'], [1, 2, 3]);
                    done();
                }
            });
            const oldHandler = clientConnection['_messageHandler'].bind(clientConnection);
            clientConnection['_messageHandler'] = (msg) => {
                const decoded =msgpackDecode(msg.data);
                assert.strictEqual(decoded[0], reliableOrderProtocols[receivedCount]);
                preReceivedCount++;
                assert(decoded[1] === preReceivedCount);
                oldHandler(msg);
            }
            clientConnection.onMessage(playerClient.connector.onMessageCallback.bind(playerClient.connector));
            for(let i = 0; i < reliableOrderProtocols.length; i++) {
                webRtcServerClient.sendReliable([reliableOrderProtocols[i]], true, { firstRetryRate: 1000, retryRate: 1000 });
            }
        })
        it('packets send reliable strips the sequence when it reaches the connector callback', (done) => {
            const reliableProtocols = [Protocol.SYSTEM_MESSAGE_RELIABLE, Protocol.IMMEDIATE_SYSTEM_MESSAGE_RELIABLE, Protocol.SYSTEM_MESSAGE_RELIABLE]
            clientConnection = playerClient.connector.serverConnection
            assert(clientConnection instanceof WebRTCConnection)
            let receivedCount  = 0;
            let preReceivedCount = 0;
            playerClient.connector.onMessageCallback = ((decoded) => {
                assert(decoded.length === 1);
                assert.strictEqual(decoded[0], reliableProtocols[receivedCount]);
                receivedCount++;
                assert.strictEqual(clientConnection['sentReliableAckSequences'].length, receivedCount);
                assert.strictEqual(clientConnection['sentOrderedAckSequences'].length, 0);
                if(receivedCount === reliableProtocols.length) {
                    assert.strictEqual(preReceivedCount, receivedCount);
                    assert.deepStrictEqual(clientConnection['sentReliableAckSequences'], [1, 2, 3]);
                    done();
                }
            });
            const oldHandler = clientConnection['_messageHandler'].bind(clientConnection);
            clientConnection['_messageHandler'] = (msg) => {
                const decoded =msgpackDecode(msg.data);
                assert.strictEqual(decoded[0], reliableProtocols[receivedCount]);
                preReceivedCount++;
                assert(decoded[1] === preReceivedCount);
                oldHandler(msg);
            }
            clientConnection.onMessage(playerClient.connector.onMessageCallback.bind(playerClient.connector));
            for(let i = 0; i < reliableProtocols.length; i++) {
                webRtcServerClient.sendReliable([reliableProtocols[i]], true, { firstRetryRate: 1000, retryRate: 1000 });
            }
        })

        it('packets send reliable strips the sequence when it reaches the connector callback', (done) => {
            const reliableProtocols = [Protocol.SYSTEM_MESSAGE_RELIABLE, Protocol.IMMEDIATE_SYSTEM_MESSAGE_RELIABLE, Protocol.SYSTEM_MESSAGE_RELIABLE]
            clientConnection = playerClient.connector.serverConnection
            assert(clientConnection instanceof WebRTCConnection)
            let receivedCount  = 0;
            let preReceivedCount = 0;
            playerClient.connector.onMessageCallback = ((decoded) => {
                assert(decoded.length === 1);
                assert.strictEqual(decoded[0], reliableProtocols[receivedCount]);
                receivedCount++;
                assert.strictEqual(clientConnection['sentReliableAckSequences'].length, receivedCount);
                assert.strictEqual(clientConnection['sentOrderedAckSequences'].length, 0);
                if(receivedCount === reliableProtocols.length) {
                    assert.strictEqual(preReceivedCount, receivedCount);
                    assert.deepStrictEqual(clientConnection['sentReliableAckSequences'], [1, 2, 3]);
                    done();
                }
            });
            const oldHandler = clientConnection['_messageHandler'].bind(clientConnection);
            clientConnection['_messageHandler'] = (msg) => {
                const decoded =msgpackDecode(msg.data);
                assert.strictEqual(decoded[0], reliableProtocols[receivedCount]);
                preReceivedCount++;
                assert(decoded[1] === preReceivedCount);
                oldHandler(msg);
            }
            clientConnection.onMessage(playerClient.connector.onMessageCallback.bind(playerClient.connector));
            for(let i = 0; i < reliableProtocols.length; i++) {
                webRtcServerClient.sendReliable([reliableProtocols[i]], true, { firstRetryRate: 1000, retryRate: 1000 });
            }
        })
        it('tests that the client handles an ACK_SYNC message correctly', (done) => {
            clientConnection['reliableBuffer'] = {
                1: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                2: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                3: {
                    timeout: setTimeout(() => {
                        assert.deepStrictEqual(Object.keys(clientConnection['reliableBuffer']), ['3'])
                        assert.strictEqual(Object.keys(clientConnection['orderedReliableBuffer']).length, 0)
                        done();
                    }, 100),
                }
            }
            clientConnection['orderedReliableBuffer'] = {
                1: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                2: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                3: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),}
            }
            webRtcServerClient.send(msgpack.encode([Protocol.ACK_SYNC, 1, 2, [1, 2, 3]]));
        });

        it('tests that client handles messages in order even when received out of order', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [9, 5, 3, 8, 1, 4, 6, 7, 10, 11, 2];
            playerClient.connector.onMessageCallback = ((decoded) => {
                callOrder.push(decoded[1]);
                if(callOrder.length === outOfOrderSeq.length) {
                    assert.deepStrictEqual(callOrder, outOfOrderSeq.sort((a, b) => a-b));
                    playerClient.connector.onMessageCallback = () => {};
                    done();
                }
            });
            clientConnection.onMessage(playerClient.connector.onMessageCallback.bind(playerClient.connector));
            outOfOrderSeq.forEach(seq => {
                webRtcServerClient.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED, seq, seq]));
            })
        });
        it('tests that client handles messages in order even when received out of order and received duplicate times', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [1, 1, 3, 9, 1, 1, 10, 12, 1, 3, 3, 2, 3, 2, 10, 1, 5, 3, 8, 1, 9, 1, 4, 6, 7, 10, 11, 2];
            const expectedUniqueSeq = Array.from(new Set(outOfOrderSeq)).sort((a,b) => a-b);
            playerClient.connector.onMessageCallback = ((decoded) => {
                callOrder.push(decoded[1]);
                if(callOrder.length === expectedUniqueSeq.length) {
                    assert.deepStrictEqual(callOrder, expectedUniqueSeq);
                    playerClient.connector.onMessageCallback = () => {};
                    done();
                }
            });
            clientConnection.onMessage(playerClient.connector.onMessageCallback.bind(playerClient.connector));
            outOfOrderSeq.forEach(seq => {
                webRtcServerClient.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED, seq, seq]));
            })
        });

        it('tests that client wont handle the same sequence multiple times', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [1, 1, 3, 9, 1, 1, 10, 12, 1, 3, 3, 2, 3, 2, 10, 1, 5, 3, 8, 1, 9, 1, 4, 6, 7, 10, 11, 2];
            const expectedUniqueSeq = [];
            outOfOrderSeq.forEach(i => {
                !expectedUniqueSeq.includes(i) && expectedUniqueSeq.push(i)
            });
            playerClient.connector.onMessageCallback = ((decoded) => {
                callOrder.push(decoded[1]);
                if(callOrder.length === expectedUniqueSeq.length) {
                    setTimeout(() => {
                        assert.deepStrictEqual(callOrder, expectedUniqueSeq);
                        assert.deepStrictEqual(clientConnection['alreadyProcessedReliableSeqs'], {});
                        assert.deepStrictEqual(clientConnection['lowestUnorderedSeqProcessed'], 12);
                        playerClient.connector.onMessageCallback = () => {};
                        done();
                    },0)
                }
            });
            clientConnection.onMessage(playerClient.connector.onMessageCallback.bind(playerClient.connector));
            outOfOrderSeq.forEach(seq => {
                webRtcServerClient.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE, seq, seq]));
            })
        });

    });

    afterEach((done) => {
        proxy.close();
        gate.close();
        auth.close();
        connector.close().then(() => {
            connector = null;
            gate = null;
            auth = null;
            proxy = null;
            setTimeout(() => {
                done();
            }, 1000)
        });
    });
})

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
describe.only('E2E Connector tests', () => {
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
            const confirmWebRTCConnection = (_done) => {
                clientConnection = playerClient.connector.serverConnection
              //  console.log('client connection was', clientConnection['pc'] ? clientConnection['pc'].dataChannel.readyState : null);
               // console.log('server connection was', webRtcServerClient.state, 'dc:', webRtcServerClient.dataChannel)
                if(clientConnection['pc'] && clientConnection['pc'].dataChannel.readyState === 'open' && webRtcServerClient && webRtcServerClient.state === 'open') {
                    _done();
                } else {
                    setTimeout(() => {
                        confirmWebRTCConnection(_done);
                    }, 10);
                }
            }
            connector.once('webrtc-connection', (newWebRTCClient) => {
                webRtcServerClient = newWebRTCClient;
                assert(connector.clientsById[playerClient.connector.gottiId] === newWebRTCClient);
                assert(newWebRTCClient instanceof WebRTCConnectorClient)
                setTimeout(() => {
                    confirmWebRTCConnection(done);
                }, 10);
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
                console.log('decoded', decoded);
                callOrder.push(decoded[1]);
                console.log('call order', callOrder);
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
                    assert.deepStrictEqual(callOrder, expectedUniqueSeq)
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

        it('sends from client to server', (done) => {
            clientConnection = playerClient.connector.serverConnection
            assert(clientConnection instanceof WebRTCConnection)
            const sent = msgpack.encode([Protocol.SYSTEM_MESSAGE, {'test': 'data' }]);
            clientConnection.send(sent);
            webRtcServerClient.on('message', received => {
                assert.deepStrictEqual(received, [Protocol.SYSTEM_MESSAGE, {'test': 'data' }])
                done();
            })
        });
        it('tests that the server handles an ACK_SYNC message correctly', (done) => {
            webRtcServerClient['reliableBuffer'] = {
                1: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                2: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                3: {
                    timeout: setTimeout(() => {
                        assert.deepStrictEqual(Object.keys(webRtcServerClient['reliableBuffer']), ['3'])
                        assert.strictEqual(Object.keys(webRtcServerClient['orderedReliableBuffer']).length, 0)
                        done();
                    }, 100),
                }
            }
            webRtcServerClient['orderedReliableBuffer'] = {
                1: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                2: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),},
                3: {timeout: setTimeout(() => { throw new Error(`Failed!!!`) }, 101),}
            }
            clientConnection.send(msgpack.encode([Protocol.ACK_SYNC, 1, 2, [1, 2, 3]]));
        });

        it('tests that server handles messages in order on ack sequence overflow', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [2, 65531, 6, 65532, 65534, 1, 65533, 4, 5, 3];
            const expectedOrder = [65531, 65532, 65533, 65534, 1, 2, 3, 4, 5, 6];
            webRtcServerClient['lastAckSequenceNumber'] = 65530;
            webRtcServerClient.on('message', decoded => {
                callOrder.push(decoded[1]);
                if(callOrder.length === outOfOrderSeq.length) {
                    assert.deepStrictEqual(callOrder, expectedOrder);
                    done();
                }
            });
            outOfOrderSeq.forEach(seq => {
                clientConnection.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED, seq, seq]));
            })
        });
        it('tests that server handles messages in order on ack sequence overflow even with duplicates', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [2, 2, 1, 2, 3, 65531, 65531, 65531, 65533, 65531, 6, 2, 5, 65532, 65532, 6, 65532, 65534, 1, 65533, 4, 5, 3];
            const expectedOrder = [65531, 65532, 65533, 65534, 1, 2, 3, 4, 5, 6];
            webRtcServerClient['lastAckSequenceNumber'] = 65530;
            webRtcServerClient.on('message', decoded => {
                callOrder.push(decoded[1]);
                if(callOrder.length === expectedOrder.length) {
                    assert.deepStrictEqual(callOrder, expectedOrder);
                    done();
                }
            });
            outOfOrderSeq.forEach(seq => {
                clientConnection.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED, seq, seq]));
            })
        });

        it('tests that server handles messages in order even when received out of order', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [9, 5, 3, 8, 1, 4, 6, 7, 10, 11, 2];
            webRtcServerClient.on('message', decoded => {
                callOrder.push(decoded[1]);
                if(callOrder.length === outOfOrderSeq.length) {
                    assert.deepStrictEqual(callOrder, outOfOrderSeq.sort((a, b) => a-b));
                    webRtcServerClient.removeAllListeners();
                    done();
                }
            });
            outOfOrderSeq.forEach(seq => {
                clientConnection.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED, seq, seq]));
            })
        });
        it('tests that server handles messages in order even when received out of order and received duplicate times', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [1, 1, 3, 9, 1, 1, 10, 12, 1, 3, 3, 2, 3, 2, 10, 1, 5, 3, 8, 1, 9, 1, 4, 6, 7, 10, 11, 2];
            const expectedUniqueSeq = Array.from(new Set(outOfOrderSeq)).sort((a,b) => a-b);
            webRtcServerClient.on('message', decoded => {
                callOrder.push(decoded[1]);
                if(callOrder.length === expectedUniqueSeq.length) {
                    assert.deepStrictEqual(callOrder, expectedUniqueSeq)
                    webRtcServerClient.removeAllListeners();
                    done();
                }
            });
            outOfOrderSeq.forEach(seq => {
                clientConnection.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED, seq, seq]));
            })
        });

        it('tests that server wont handle the same sequence multiple times', (done) => {
            const callOrder = [];
            const outOfOrderSeq = [1, 1, 3, 9, 1, 1, 10, 12, 1, 3, 3, 2, 3, 2, 10, 1, 5, 3, 8, 1, 9, 1, 4, 6, 7, 10, 11, 2];
            const expectedUniqueSeq = [];
            outOfOrderSeq.forEach(i => {
                !expectedUniqueSeq.includes(i) && expectedUniqueSeq.push(i)
            });
            webRtcServerClient.on('message', decoded => {
                callOrder.push(decoded[1]);
                if(callOrder.length === expectedUniqueSeq.length) {
                    setTimeout(() => {
                        assert.deepStrictEqual(callOrder, expectedUniqueSeq);
                        assert.deepStrictEqual(webRtcServerClient['alreadyProcessedReliableSeqs'], {});
                        assert.deepStrictEqual(webRtcServerClient['lowestUnorderedSeqProcessed'], 12);
                        webRtcServerClient.removeAllListeners();
                        done();
                    },0)
                }
            });
            outOfOrderSeq.forEach(seq => {
                clientConnection.send(msgpack.encode([Protocol.SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE, seq, seq]));
            })
        })

        it('tests that the player can reconnect if their connection gets interupted', (done) => {
            assert(playerClient.connector.serverConnection === clientConnection);
            assert(Object.keys(connector.reservedSeats).length === 0);

            webRtcServerClient.once('closed-channel', () => {
                setTimeout(() => {
                    assert(Object.keys(connector.reservedSeats).length === 1);
                }, 0);
                setTimeout(() => {
                    assert(!!playerClient.connector.serverConnection);
                    assert(playerClient.connector.serverConnection !== clientConnection);
                    done();
                }, 1500);
            });
            webRtcServerClient.close();
        })

        it('tests that the player can reconnect if their connection gets interupted', (done) => {
            assert(playerClient.connector.serverConnection === clientConnection);
            assert(Object.keys(connector.reservedSeats).length === 0);
            const channelClient = webRtcServerClient.channelClient;
            const gottiId = playerClient.connector.gottiId;
            webRtcServerClient.once('closed-channel', () => {
                setTimeout(() => {
                    assert.strictEqual(connector.webRTCConnections.length, 0);
                    assert(Object.keys(connector.reservedSeats).length === 1);
                }, 0);
                connector.websocketServer.once('connection', (webSocket) => {
                    setTimeout(() => {
                        assert.strictEqual(connector.clients.length, 1);
                        assert.strictEqual(Object.keys(connector.reservedSeats).length, 0);
                        assert.strictEqual(connector.clientsById[gottiId].websocket, webSocket);
                        assert.strictEqual(connector.clientsById[gottiId].channelClient, channelClient);
                        assert.deepStrictEqual(Object.keys(connector.clientsById), [gottiId]);
                        assert.notStrictEqual(webRtcServerClient,  connector.clientsById[gottiId]);
                        assert(playerClient.connector.gottiId in connector.awaitingWebRTCConnections);
                    }, 0);

                    connector.once('webrtc-connection', (newestWebRTCClient) => {
                        setTimeout(() => {
                            assert.strictEqual(connector.clients.length, 1);
                            assert.deepStrictEqual(Object.keys(connector.clientsById), [gottiId]);
                            assert.strictEqual(connector.webRTCConnections.length, 1);
                            assert.strictEqual(connector.currentWebRTCConnections, 1);
                            assert(!(playerClient.connector.gottiId in connector.awaitingWebRTCConnections));
                            assert.strictEqual(newestWebRTCClient, connector.clientsById[gottiId])
                            assert.notStrictEqual(connector.clientsById[gottiId], webRtcServerClient);
                            done();
                        }, 0);
                    });
                });
            });
            webRtcServerClient.close();
        }).timeout(3000);
    });

    afterEach((done) => {
        proxy.close();
        gate.close();
        auth.close();
        connector.close().then(() => {
            gate = null;
            auth = null;
            proxy = null;
            connector = null;
            playerClient.close();
            setTimeout(() => {
           //    console.log('connector state', connector.websocketServer.clients.size)
                done();
            }, 500)
        });
    });
})

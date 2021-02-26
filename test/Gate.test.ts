import {publicDecrypt} from "crypto";
const msgpack = require('notepack.io');
import { Gate } from '../src';
import { GameData } from '../src/Gate';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';

const gateURI = 'tcp://127.0.0.1:7070';

const mockGameData1 = {
    connectorsData: [{ serverIndex: 0, host: 'test', port: 0 },{ serverIndex: 1, host: 'test', port: 1 }],
    gameType: 'arena',
    gameId: 'arena1',
    publicOptions: {
        players: 0,
    }
}

const mockGameData2 = {
    connectorsData: [{ serverIndex: 2, host: 'test', port: 2 },{ serverIndex: 3, host: 'test', port: 3 }],
    gameType: 'arena',
    gameId: 'arena2',
    publicOptions: {
        players: 0,
    }
}

const mockGameData3 = {
    connectorsData: [{ serverIndex: 4, host: 'test', port: 4 },{ serverIndex: 5, host: 'test', port: 5 }],
    gameType: 'field',
    gameId: 'field1',
    publicOptions: {
        players: 0,
    }
};

describe('Gate', () => {
    let gate;

    beforeEach('Creates Gate instance', (done) => {
        gate = null;
        gate = new Gate({ public: gateURI, private: null });
        done();
    });
    afterEach((done) => {
        gate.disconnect();
        done();
    });


    describe('Gate.addConnector', () => {
        it('succesfully adds connector', (done) => {
            gate.addConnector('host', 1, 0, 'gameId');
            assert.strictEqual(gate.connectorsByServerIndex[0].host, 'host');
            assert.strictEqual(gate.connectorsByServerIndex[0].connectedClients, 0);
            assert.strictEqual(gate.connectorsByServerIndex[0].gameId, 'gameId');
            done();
        });
        it('throws if server index was duplicate', (done) => {
            gate.addConnector('host', 1, 0, 'gameId');
            assert.throws(() => { gate.addConnector('host2', 3231, 0, 'gameId') } );
            done();
        });
        it('throws if server host and port was duplicate', (done) => {
            gate.addConnector('host', 0, 0, 'gameId');
            assert.throws(() => { gate.addConnector('host', 0, 1, 'gameId') } );
            done();
        });
    });


    describe('Gate.addGame', () => {
        it('adds mock game data correctly', (done) => {
            let { connectorsData, gameType, gameId, publicOptions } = mockGameData1;
            gate.addGame(connectorsData, gameType, gameId, publicOptions);

            ({ connectorsData, gameType, gameId, publicOptions } = mockGameData2);
            gate.addGame(connectorsData, gameType, gameId, publicOptions);

            ({ connectorsData, gameType, gameId, publicOptions } = mockGameData3);
            gate.addGame(connectorsData, gameType, gameId, publicOptions);

            assert.strictEqual(Object.keys(gate.gamesById).length, 3);

            Object.keys(gate.gamesById).forEach(gameId => {
                assert.strictEqual(gate.gamesById[gameId].connectorsData.length, 2);
            });

            assert.strictEqual(Object.keys(gate.availableGamesByType).length, 2);

            assert.strictEqual(Object.keys(gate.availableGamesByType['arena']).length, 2);
            assert.strictEqual(Object.keys(gate.availableGamesByType['field']).length, 1);
            assert.strictEqual(Object.keys(gate.connectorsByServerIndex).length, 6);
            done();
        });

        it('throws if game id was duplicate', (done) => {
            let { connectorsData, gameType, gameId, publicOptions } = mockGameData1;
            gate.addGame(connectorsData, gameType, gameId, publicOptions);
            assert.throws(() => { gate.addGame(connectorsData, gameType, gameId, publicOptions) });
            done();
        });
    });

    describe('Gate.defineMatchMaker', () => {
        let { connectorsData, gameType, gameId, publicOptions } = mockGameData1;
        beforeEach('creates gate with one test game type', (done) => {
            gate.addGame(connectorsData, gameType, gameId, publicOptions);
            done();
        });
        it('adds to match maker map', (done) => {

            gate.defineMatchMaker(gameType, (availableGames, auth, options) => {
                return {
                    gameId,
                    seatOptions: {
                        x: 25,
                        y: 25
                    }
                }
            });
            assert.strictEqual(gate.matchMakersByGameType.size, 1);
            done();
        });

        it('throws if gametype doesnt exist', (done) => {

            assert.throws(() => {
                gate.defineMatchMaker('werwer', (availableGames, auth, options) => {
                    return {
                        gameId,
                        seatOptions: {
                            x: 25,
                            y: 25
                        }
                    }
                });
            });
            done();
        });
    });

    describe('Gate.matchMake', () => {
        let { connectorsData, gameType, gameId, publicOptions } = mockGameData1;

        beforeEach('creates gate and subs out addPlayerToConnector function', (done) => {
            gate.addGame(connectorsData, gameType, gameId, publicOptions);

            gate.addPlayerToConnector = (serverIndex, auth, seatOptions) => {
                return {
                    gottiId: '123',
                    host: connectorsData[0].host,
                    port: connectorsData[0].port
                }
            };
            done();
        });
        it('correctly runs the defined match maker', (done) => {
            let called = false;
            gate.defineMatchMaker(gameType, (availableGames, auth, options) => {
                assert.deepStrictEqual(availableGames[gameId], gate.gamesById[gameId]);
                assert.deepStrictEqual(auth, 'foobar');
                assert.deepStrictEqual(options, 'clientoptions');
                called = true;
                return {
                    gameId,
                }

            });
            gate.matchMake(gameType, 'foobar', 'clientoptions');

            setTimeout(() => {
                assert.ok(called);
                done();
            }, 10)
        });
        it('throws if theres no handler', (done) => {
            try {
                assert.throws(() => { gate.matchMake(gameType, 'foobar', 'clientoptions') } );
            } catch(err) {
                assert.ok(err)
                done();
            }
        });
        it('throws if the returned game id doesnt exist', (done) => {
            gate.defineMatchMaker(gameType, (availableGames, auth, options) => {
                return {
                    gameId: 'wrwesdijfiklu',
                    seatOptions: {},
                }
            });
            try {
                assert.throws(() => { gate.matchMake(gameType, 'foobar', 'clientoptions') } );
            } catch(err) {
                assert.ok(err);
                done();
            }
        });
    });

    describe('Gate.addPlayerToConnector / removePlayerFromConnector', () => {
        let { connectorsData, gameType, gameId, publicOptions } = mockGameData1;

        beforeEach('creates mock game and subs out reserve seat', (done) => {
            gate.addGame(connectorsData, gameType, gameId, publicOptions);
            gate.reserveSeat = (serverIndex, auth, seatOptions) => { return { host: 'mock', port: 1, gottiId: 'test'}};
            done();
        });

       it('adds 1 initially', (done) => {
           gate.addPlayerToConnector(0).then(() => {
               assert.strictEqual((gate.getClientCountOnConnector(0)), 1);
               done();
           });
       });
       it('sorted when added', (done) => {
           gate.addPlayerToConnector(0).then(() => {
               const connectorsData = (gate.gamesById[gate.getGameIdOfConnector(0)].connectorsData);
               assert.strictEqual((gate.getClientCountOnConnector(0)), 1);
               assert.strictEqual(connectorsData.length, 2);
               // first element should be serverIndex 1 and have 0 clients connected
               assert.strictEqual(connectorsData[0].connectedClients, 0);
               assert.strictEqual(connectorsData[0].serverIndex, 1);

               // next element should be serverIndex 0 and have 1 client connected
               assert.strictEqual(connectorsData[1].connectedClients, 1);
               assert.strictEqual(connectorsData[1].serverIndex, 0);
               done();
           });
       });

       it('re sorts when the connector with most changes', (done) => {
           gate.addPlayerToConnector(0).then(() => {
               const connectorsData = (gate.gamesById[gate.getGameIdOfConnector(0)].connectorsData);
               assert.strictEqual(connectorsData[0].serverIndex, 1);
               gate.addPlayerToConnector(1).then(() => {
                   gate.addPlayerToConnector(1).then(() => {
                        assert.strictEqual(connectorsData[0].serverIndex, 0);
                        done();
               })})
           });
       });

        it('re sorts when the connector with most loses players', (done) => {
            gate.addPlayerToConnector(0).then(() => {
                const connectorsData = (gate.gamesById[gate.getGameIdOfConnector(0)].connectorsData);
                assert.strictEqual(connectorsData[0].serverIndex, 1);
                gate.addPlayerToConnector(1).then(() => {
                    gate.addPlayerToConnector(1).then(() => {
                        assert.strictEqual(connectorsData[0].serverIndex, 0);
                        gate.removePlayerFromConnector(1);
                        gate.removePlayerFromConnector(1);
                        assert.strictEqual(connectorsData[0].serverIndex, 1);
                        done();
                    })})
            });
        });
    });

    describe('Gate.gateKeep', () => {
        before('defines handler', done => {
            gate.registerGateKeep((req, res) => {
                if(req.auth) {
                    return true;
                } else {
                    return false;
                }
            });
            done();
        });
       it('adds gateData to authenticated response',(done) =>{
           let mockReq = {
               auth: true,
           };
           let mockRes = {
               status: (code: number) => {

                   assert.strictEqual(code, 200);

                   return {
                       json: (data: any) => {
                        //   assert.deepStrictEqual(data, mockGateUrls);
                           done();
                       }
                   }
               }
           };
            gate.gateKeep(mockReq, mockRes);
       });
    });
});

const msgpack = require('notepack.io');
import { Gate } from '../src';
import { GameData } from '../src/Gate';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';

const gateURI = 'tcp://127.0.0.1:7070';

const mockGamesData = [
    {
        id: 'game1',
        type: 'test',
        connectorsData: [{
            URL: '0',
            serverIndex: 0,
            connectedClients: 0,
            gameId: 'game1',
            heartbeat: () => {},
        },{
            URL: '1',
            serverIndex: 1,
            connectedClients: 0,
            gameId: 'game1',
            heartbeat: () => {},
        }]
    },
    {
        id: 'game2',
        type: 'test',
        connectorsData: [{
            URL: '2',
            serverIndex: 2,
            connectedClients: 0,
            gameId: 'game2',
            heartbeat: () => {
            },
        }]
    },
    {
        id: 'game3',
        type: 'test3',
        connectorsData: [{
            URL: '3',
            serverIndex: 3,
            connectedClients: 0,
            gameId: 'game3',
            heartbeat: () => {
            },
        }]
    }
] as Array<GameData>;

describe('Gate', () => {
    let gate;

    before('Creates Gate instance', (done) => {
        gate = new Gate(gateURI, mockGamesData);
        done();
    });

    describe('Gate.formatGamesData', () => {
        it('formats correctly', (done) => {
            const { gamesById, gamesByType, connectorsByServerIndex, availableGamesByType } = (gate.formatGamesData(mockGamesData));
            assert.ok(gamesById && gamesById && connectorsByServerIndex, availableGamesByType);

            assert.strictEqual(Object.keys(gamesById).length, 3);
            assert.strictEqual(Object.keys(gamesByType).length, 2);
            assert.strictEqual(Object.keys(connectorsByServerIndex).length, 4);
            assert.strictEqual(Object.keys(availableGamesByType).length, 2);
            done();
        })
    });

    describe('Gate.addPlayerToConnector / removePlayerFromConnector', () => {
       it('adds 1 initially', (done) => {
           (gate.addPlayerToConnector(0));
           assert.strictEqual((gate.getClientCountOnConnector(0)), 1);
           done();
       });
       it('sorted when added', (done) => {
           const connectorsData = (gate.gamesById[gate.getGameIdOfConnector(0)].connectorsData);
            assert.strictEqual(connectorsData.length, 2);
            // first element should be serverIndex 1 and have 0 clients connected
            assert.strictEqual(connectorsData[0].connectedClients, 0);
            assert.strictEqual(connectorsData[0].serverIndex, 1);

           // next element should be serverIndex 0 and have 1 client connected
           assert.strictEqual(connectorsData[1].connectedClients, 1);
           assert.strictEqual(connectorsData[1].serverIndex, 0);
           done();
       });

       it('re sorts when the connector with most changes', (done) => {
           (gate.addPlayerToConnector(1));
           (gate.addPlayerToConnector(1));

           const connectorsData = (gate.gamesById[gate.getGameIdOfConnector(0)].connectorsData);

           assert.strictEqual(connectorsData.length, 2);
           // first element should be serverIndex 0 and have 1 client connected
           assert.strictEqual(connectorsData[0].connectedClients, 1);
           assert.strictEqual(connectorsData[0].serverIndex, 0);

           // next element should be serverIndex 1 and have 2 clients connected
           assert.strictEqual(connectorsData[1].connectedClients, 2);
           assert.strictEqual(connectorsData[1].serverIndex, 1);
            done();
       });

        it('re sorts when the connector with most loses players', (done) => {
            (gate.removePlayerFromConnector(1));
            (gate.removePlayerFromConnector(1));

            const connectorsData = (gate.gamesById[gate.getGameIdOfConnector(0)].connectorsData);

            assert.strictEqual(connectorsData.length, 2);
            // first element should be serverIndex 1 and have 0 clients connected
            assert.strictEqual(connectorsData[0].connectedClients, 0);
            assert.strictEqual(connectorsData[0].serverIndex, 1);

            // next element was server index 0 and still has 1 client connected
            assert.strictEqual(connectorsData[1].connectedClients, 1);
            assert.strictEqual(connectorsData[1].serverIndex, 0);
            done();

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

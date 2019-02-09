import * as http from 'http';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';

import { MasterServer } from '../src';
import config from './mocks/config';

describe('Master Server tests', () => {
    let masterServer;

    afterEach('', (done) => {
       masterServer = null;
       done();
    });

    describe('Master Server constructor', () => {
        it('initializes available servers correctly', (done) => {
            masterServer = new MasterServer(config);
            assert.strictEqual(masterServer.availableConnectorServers.length, 2);
            assert.strictEqual(masterServer.availableAreaServers.length, 2);
            assert.strictEqual(Object.keys(masterServer.gameConfigs).length, 1);
            done();
        });
    });

    describe('masterServer.initializeConfigs', () => {
        let configs: any = {};
        before(('initializes'), (done) => {
            masterServer = new MasterServer(config);
            configs = masterServer.initializeConfigs('test_game');
            done();
        });
        it('removed available servers since they were used in the initialization', (done) => {
            assert.strictEqual(masterServer.availableConnectorServers.length, 0);
            assert.strictEqual(masterServer.availableAreaServers.length, 0);
            done();
        });
        it('has correct configs', (done) => {
            assert.ok(configs['areaConfigs']);
            assert.ok(configs['connectorsConfig']);
            assert.ok(configs['gateGameConfig']);
            done();
        });
        it('area config is correct', (done) => {
            const areaConfigs = configs.areaConfigs;

            assert.strictEqual(areaConfigs.length, 2);
            assert.ok(!(isNaN(areaConfigs[0].serverIndex)));
            assert.strictEqual(Math.abs(areaConfigs[0].serverIndex-areaConfigs[1].serverIndex), 1);

            assert.strictEqual(areaConfigs[0].areas.length, 2);

            assert.strictEqual(areaConfigs[0].areas[0].id, 'test_area_1');
            assert.deepStrictEqual(areaConfigs[0].areas[0].options, { 'foo': 'bar1' });
            assert.deepStrictEqual(areaConfigs[0].areas[0].constructorPath, '../test/mocks/AreaRooms/mock1.ts');
            assert.strictEqual(areaConfigs[0].areas[1].id, 'test_area_2');
            assert.deepStrictEqual(areaConfigs[0].areas[1].options, { 'foo': 'bar2' });
            assert.deepStrictEqual(areaConfigs[0].areas[1].constructorPath, '../test/mocks/AreaRooms/mock1.ts');

            assert.strictEqual(areaConfigs[1].areas[0].id, 'test_area_3');
            assert.deepStrictEqual(areaConfigs[1].areas[0].options, { 'foo': 'bar3' });
            assert.deepStrictEqual(areaConfigs[1].areas[0].constructorPath, '../test/mocks/AreaRooms/mock2.ts');
            assert.strictEqual(areaConfigs[1].areas[1].id, 'test_area_4');
            assert.deepStrictEqual(areaConfigs[1].areas[1].options, { 'foo': 'bar4' });
            assert.deepStrictEqual(areaConfigs[1].areas[1].constructorPath, '../test/mocks/AreaRooms/mock2.ts');

            assert.deepStrictEqual(areaConfigs[0].connectorURIs.sort(), config.connector_servers.sort());
            assert.deepStrictEqual(areaConfigs[1].connectorURIs.sort(), config.connector_servers.sort());

            assert.deepStrictEqual(areaConfigs[0].areaURI, config.area_servers[1]);
            assert.deepStrictEqual(areaConfigs[1].areaURI, config.area_servers[0]);

            assert.ok(configs['areaConfigs']);
            done();
        });

        it('connector config is correct', (done) => {
            const connectorsConfig = configs.connectorsConfig;
            assert.strictEqual(connectorsConfig.length, 2);
            assert.strictEqual(Math.abs(connectorsConfig[0].serverIndex-connectorsConfig[1].serverIndex), 1);
            assert.deepStrictEqual(connectorsConfig[0].areaRoomIds.sort(), ['test_area_1', 'test_area_2', 'test_area_3', 'test_area_4'] );
            assert.deepStrictEqual(connectorsConfig[1].areaRoomIds.sort(), ['test_area_1', 'test_area_2', 'test_area_3', 'test_area_4'] );

            assert.deepStrictEqual(connectorsConfig[0].areaServerURIs.sort(), config.area_servers);
            assert.deepStrictEqual(connectorsConfig[1].areaServerURIs.sort(), config.area_servers);

            assert.deepStrictEqual(connectorsConfig[0].port, 8081);
            assert.deepStrictEqual(connectorsConfig[1].port, 8081);

            assert.strictEqual(connectorsConfig[0].gateURI, config.gate_server);
            assert.strictEqual(connectorsConfig[1].gateURI, config.gate_server);

            done();
        });
    });

    describe('masterServer.initializeConfigs', () => {
        let configs: any = {};
        before(('initializes'), (done) => {
            masterServer = new MasterServer(config);
            configs = masterServer.initializeConfigs('test_game');
            done();
        });
        it('tries to start an area', (done) => {
            const area = masterServer.startArea(configs.areaConfigs[0])
            console.log('area was', area);
            done()
        });
    });
});

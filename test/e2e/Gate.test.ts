require('../setup');
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';
import { Proxy } from '../../src/Proxy';
import { Client } from 'gotti';
import {clientProcess,} from './mocks/client/process';
import {AuthWebServer, Connector, ConnectorOptions, GateWebServer} from "../../src";
import { MockConnector } from './mocks/server/Connector';
import {ServerURI} from "../../src/Connector";
import {createGate} from "../mocks/gate/DummyGate";

import {
    AUTH_PORT,
    CONNECTOR_CLIENT_PORT, CONNECTOR_SERVER_PORT,
    GATE_CLIENT_PORT,
    GATE_SERVER_PORT,
    LOCAL_HOST,
    makeURI,
    makeURL
} from "../mock";

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
let client;
let connector;
let gate : GateWebServer;
let proxy;
let auth;

const mockGameData = () => {
    return { gameId: 'test1', gameType: 'test', gameData: { mock: 'data'}, areaData: {}, publicOptions: { 'test': 'public_options'} }
}

describe('E2E Gate tests', () => {
    beforeEach('Inits the servers and authenticates a client', async () => {
        proxy = new Proxy(makeURL(AUTH_PORT), makeURL(GATE_CLIENT_PORT), [makeURL(1010)], 80, [{ proxyId: 'connector', port: CONNECTOR_CLIENT_PORT, host: LOCAL_HOST }])
        auth = new AuthWebServer(makeURI(GATE_SERVER_PORT), AUTH_PORT);
        connector = new MockConnector(opts())
        gate = createGate(makeURI(GATE_SERVER_PORT).public, GATE_CLIENT_PORT, [{ serverIndex: 1, host: LOCAL_HOST, port: CONNECTOR_CLIENT_PORT, proxyId: 'connector'}], mockGameData())
        await auth.init();
        await gate.init();
        await proxy.init();
        await connector.connectToAreas();
        assert(!!proxy);
        assert(!!gate.gate);
        assert(!!auth);
        assert(!!connector);
        auth.addOnAuth(() => true);
        client = new Client([clientProcess], 'localhost', false, 'http', 80);
        await client.authenticate();
        console.log('authenticated')
    })
    it('tests getGames', async() => {
        const games = await client.getGames();
        assert.deepStrictEqual(games, {'test': { 'test1': { options: {'test': 'public_options'}}}})
        assert(!!games);
    })
    it('tests getGames with custom gate keep', async() => {
        gate.gate.registerGateKeep((clientOptions, availableGames, auth) => {
            return {
                clientOptions,
                availableGames
            }
        })
        const games = await client.getGames({ 'custom': 'option'});
        assert.deepStrictEqual(games, { clientOptions: {'custom':'option'}, availableGames: {'test': { 'test1': { options: {'test': 'public_options'}}}} });
        assert(!!games);
    })
    it('tests joinGame', async() => {
        let called = false;
        gate.gate.defineMatchMaker('test', () => {
            called = true;
            return 'test1'
        });
        const game = await client.joinGame('test');
        assert.deepStrictEqual(game, { gameData: { mock: 'data' }, areaData: {}, joinOptions: undefined})
    })

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

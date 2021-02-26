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

const opts : ConnectorOptions = {
    server: 'http',
    port: CONNECTOR_CLIENT_PORT,
    serverIndex: 1,
    connectorURI: makeURI(CONNECTOR_SERVER_PORT),
    gameData: {},
    gateURI: makeURI(GATE_SERVER_PORT),
    areaRoomIds: [],
    areaServerURIs: [],
}
let client;
let connector;
let gate : GateWebServer;
let proxy;
let auth;
describe('E2E Authentication tests', () => {
    beforeEach(async () => {
        proxy = new Proxy(makeURL(AUTH_PORT), makeURL(GATE_CLIENT_PORT), [makeURL(1010)], 80, [{ proxyId: 'connector', port: CONNECTOR_CLIENT_PORT, host: LOCAL_HOST }])
        auth = new AuthWebServer(makeURI(GATE_SERVER_PORT), AUTH_PORT);
        connector = new MockConnector(opts)
        gate = createGate(makeURI(GATE_SERVER_PORT).public, GATE_CLIENT_PORT,[{ serverIndex: 0, host: LOCAL_HOST, port: CONNECTOR_CLIENT_PORT, proxyId: 'connector'}])
        await auth.init();
        await gate.init();
        await proxy.init();
        assert(!!proxy);
        assert(!!gate.gate);
        assert(!!auth);
        assert(!!connector);
    })
    it('tests client can authenticate', async() => {
        client = new Client([clientProcess], 'localhost', false, 'http', 80);
        let called = false;
        auth.addOnAuth(() => {
            called = true;
            return { auth: 'wasTrue'};
        });
        console.log('making request')
        const res = await client.authenticate();
        console.log('res was', res);
        assert.deepStrictEqual(res, { auth: 'wasTrue'});
        assert(!!res);
        assert.deepStrictEqual(auth.authMap.get(client.authId).auth, { auth: 'wasTrue'})
        assert.deepStrictEqual(client.auth.data, { auth: 'wasTrue'})
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
    })
})

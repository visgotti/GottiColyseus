"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const msgpack = require('notepack.io');
const WebSocket = require("ws");
exports.WS_CLOSE_CONSENTED = 4000;
var StateProtocol;
(function (StateProtocol) {
    StateProtocol[StateProtocol["SET"] = 0] = "SET";
    StateProtocol[StateProtocol["PATCH"] = 1] = "PATCH";
})(StateProtocol = exports.StateProtocol || (exports.StateProtocol = {}));
exports.GOTTI_HTTP_ROUTES = {
    BASE_AUTH: '/gotti_auth',
    AUTHENTICATE: '/gotti_authenticate',
    REGISTER: '/gotti_register',
    BASE_GATE: '/gotti_gate',
    BASE_PUBLIC_API: '/gotti_api',
    GET_GAMES: '/gotti_games',
    JOIN_GAME: '/gotti_join_game',
    CONNECTOR: '/gotti_connector'
};
exports.GOTTI_ROUTE_BODY_PAYLOAD = '__GOTTI_ROUTE_BODY_PAYLOAD__';
exports.GOTTI_GET_GAMES_OPTIONS = '__GOTTI_GET_GAMES_OPTIONS__';
exports.GOTTI_AUTH_KEY = '__GOTTI_AUTH_KEY__';
exports.GOTTI_GATE_AUTH_ID = '__GOTTI_AUTH_ID__';
exports.GOTTI_GATE_CHANNEL_PREFIX = '__GOTTI_GATE_CHANNEL__';
exports.GOTTI_MASTER_CHANNEL_ID = '__GOTTI_MASTER_CHANNEL__';
exports.GOTTI_MASTER_SERVER_INDEX = 55555;
exports.GOTTI_RELAY_CHANNEL_ID = '__GOTTI_RELAY_CHANNEL__';
exports.GOTTI_RELAY_SERVER_INDEX = 55556;
function decode(message) {
    try {
        message = msgpack.decode(Buffer.from(message));
    }
    catch (e) {
        //  debugAndPrintError(`message couldn't be decoded: ${message}\n${e.stack}`);
        return;
    }
    return message;
}
exports.decode = decode;
function send(client, message, encode = true) {
    if (client.readyState === WebSocket.OPEN) {
        client.send((encode && msgpack.encode(message)) || message);
    }
}
exports.send = send;

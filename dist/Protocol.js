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

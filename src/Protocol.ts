export const MAX_ACK_SEQ = 65535;

import {IConnectorClient} from "./ConnectorClients/IConnectorClient";

const msgpack = require('notepack.io');

import * as WebSocket from 'ws';
//import { debugAndPrintError } from './Debug';
import { ConnectorClient } from './ConnectorClient';
export const WS_CLOSE_CONSENTED = 4000;

export enum ReservedSeatType {
    GATE,
    DIRTY_WEB_RTC_DISCONNECT
}


export const enum Protocol {
    // web client > front connector messages
    // unreliable message types (0-5)
    SYSTEM_MESSAGE = 0,
    SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES=1,
    IMMEDIATE_SYSTEM_MESSAGE = 2,
    ACK_SYNC=3,

    // reliable message types (6-11)
    SYSTEM_MESSAGE_RELIABLE=6,
    SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE=7,
    IMMEDIATE_SYSTEM_MESSAGE_RELIABLE=8,

    //reliable ordered message types (12+)
    SYSTEM_MESSAGE_RELIABLE_ORDERED=12,
    SYSTEM_TO_MULTIPLE_CLIENT_MESSAGES_RELIABLE_ORDERED=13,
    IMMEDIATE_SYSTEM_MESSAGE_RELIABLE_ORDERED=14,
    // connector specific.
    JOIN_CONNECTOR = 15,
    JOIN_CONNECTOR_ERROR = 16,
    LEAVE_CONNECTOR = 17,
    INITIATE_CHANGE_TO_WEBRTC=18,
    SERVER_WEBRTC_CANDIDATE=19,
    GET_INITIAL_CLIENT_AREA_WRITE = 20,
    SET_CLIENT_AREA_WRITE = 21,
    ADD_CLIENT_AREA_LISTEN = 22,
    REMOVE_CLIENT_AREA_LISTEN = 23,
    WRITE_AREA_ERROR = 24,
    LISTEN_AREA_ERROR = 25,
    AREA_STATE_UPDATE = 27,
    AREA_DATA = 26,




        // area-related 20-39

        //global messages 40 - 49
    GLOBAL_DATA = 40,
    GAME_STARTING = 41,
    GAME_ENDING = 42,

        // area to area communication
    AREA_PUBLIC_OPTIONS = 43,
    AREA_TO_AREA_SYSTEM_MESSAGE = 44,
    AREA_TO_MASTER_MESSAGE = 45,
    MASTER_TO_AREA_BROADCAST = 46,
    GLOBAL_MASTER_MESSAGE = 47,
        // Generic messages (50~60)
    BAD_REQUEST = 50,

    // P2P/WEBRTC Codes
    CLIENT_WEB_RTC_ENABLED = 100,
    ENABLED_CLIENT_P2P_SUCCESS = 101,
    DISABLED_CLIENT_P2P = 102,
    OFFER_PEER_CONNECTION = 103,
    OFFER_PEER_CONNECTION_SUCCEEDED = 104,
    OFFER_PEER_CONNECTION_FAILED = 105,

    ANSWER_PEER_CONNECTION = 106,
    ANSWER_PEER_CONNECTION_SUCCEEDED = 107,
    ANSWER_PEER_CONNECTION_FAILED = 108,

    SIGNAL_REQUEST= 111,
    SIGNAL_SUCCESS= 112,
    SIGNAL_FAILED=113,
    PEER_CONNECTION_REQUEST=114,
    PEER_REMOTE_SYSTEM_MESSAGE = 109,
    PEERS_REMOTE_SYSTEM_MESSAGE = 110,

    RESPONSE_TO_PEER_CONNECTION_REQUEST,
    REQUEST_PEER_DISCONNECT,

    SEND_PEER_CONNECTION_DATA,
    SEND_PEER_MESSAGE,

    BROADCAST_PEER_MESSAGE,

    FAILED_SEND_PEER_MESSAGE,
    FAILED_BROADCAST_PEER_MESSAGE,

    ADDED_P2P,
    REMOVED_P2P,

        // WebSocket error codes
    WS_SERVER_DISCONNECT = 4201,
    WS_TOO_MANY_CLIENTS = 4202,
}

export const enum GateProtocol {
    // Gate Communication 61-70
    RESERVE_PLAYER_SEAT = '1',
    HEARTBEAT = '2',
    RESERVE_AUTHENTICATION = '3',
    GET_AUTHENTICATION = '4',
    UPDATE_AUTHENTICATION = '5',
}

export enum StateProtocol {
    SET = 0,
    PATCH = 1
}

export const GOTTI_HTTP_ROUTES = {
    BASE_AUTH: '/gotti_auth',
    AUTHENTICATE: '/gotti_authenticate',
    REGISTER: '/gotti_register',
    BASE_GATE: '/gotti_gate',
    BASE_PUBLIC_API: '/gotti_api',
    GET_GAMES: '/gotti_games',
    JOIN_GAME: '/gotti_join_game',
    CONNECTOR: '/gotti_connector'
}

export const GOTTI_ROUTE_BODY_PAYLOAD = '__GOTTI_ROUTE_BODY_PAYLOAD__';
export const GOTTI_GET_GAMES_OPTIONS = '__GOTTI_GET_GAMES_OPTIONS__';
export const GOTTI_AUTH_KEY = '__GOTTI_AUTH_KEY__';
export const GOTTI_GATE_AUTH_ID = '__GOTTI_AUTH_ID__';

export const GOTTI_GATE_CHANNEL_PREFIX = '__GOTTI_GATE_CHANNEL__';

export const GOTTI_MASTER_CHANNEL_ID = '__GOTTI_MASTER_CHANNEL__';
export const GOTTI_MASTER_SERVER_INDEX = 55555;

export const GOTTI_RELAY_CHANNEL_ID = '__GOTTI_RELAY_CHANNEL__';
export const GOTTI_RELAY_SERVER_INDEX = 55556;

export function decode(message: any) {
    try {
        message = msgpack.decode(Buffer.from(message));

    } catch (e) {
      //  debugAndPrintError(`message couldn't be decoded: ${message}\n${e.stack}`);
        return;
    }

    return message;
}

export function send(client: IConnectorClient, protocol: number, message: any, encode: boolean = true) {
    if(client.state !== "open") return;
    if(protocol < 6) {
        client.send(encode && msgpack.encode(message) || message);
    } else {
        client.sendReliable(message, protocol > 11)
    }
}

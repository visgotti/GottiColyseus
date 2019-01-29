/*
*   Example configuration file for Gotti project.
* */

const { Gate, AreaServer } = require('../dist');

const ExampleAreaRoom = require('./server/AreaRooms/ExampleAreaRoom');
const ExampleConnector = require('./server/Connectors/ExampleConnector');

const connector_1_uri = 'tcp://127.0.0.1:4000';
const connector_2_uri = 'tcp://127.0.0.1:4001';

const area_server_uri = 'tcp://127.0.0.1:5000';

module.exports.connector1Options = {
    constructorPath: '',
    server: 'http',
    port: 8081,
    roomId: 'test',
    serverIndex: 2,
    connectorURI: connector_1_uri,
    areaRoomIds: ['example_area_room_1', 'example_area_room_2'],
    areaServerURIs: [area_server_uri]
};

module.exports.connector2Options = {
    server: 'http',
    port: 8082,
    roomId: 'test2',
    serverIndex: 3,
    connectorURI: connector_2_uri,
    areaRoomIds:  ['example_area_room_1', 'example_area_room_2'],
    areaServerURIs: [area_server_uri]
}

module.exports.areaServerOptions = {
    serverIndex: 0,
    areas: [{
        RoomConstructor: ExampleAreaRoom,
        id: 'example_area_room_1',
        publicOptions: {
            'foo': 'bar',
        }
    }, {
        RoomConstructor: ExampleAreaRoom,
        id: 'example_area_room_2',
        publicOptions: {
            'foo': 'baz'
        }
    }],
    connectorURIs: [connector_1_uri, connector_2_uri],
    areaURI: area_server_uri,
};


class WorldMapRoom {}

class CaveRoom {}

class BuildingRoom {}

const config = {
    games: [{
        type: 'mainGame',
        connectorCount: 4, //how many connector servers you want to use.
        areaServers: [{
            serverId: 'worldMap',
            areaRooms: [
                {
                    id: 'top-left-map',
                    roomConstructor: WorldMapRoom,//area room constructor,
                    options: { // options get sent to player when they succesfully join the game
                        rect: [0, 0, 250, 250],
                        levelName: 'worldMap.json'
                    },
                },
                {
                    id: 'top-right-map',
                    roomConstructor: WorldMapRoom,
                    options: {
                        rect: [250, 0, 250, 250],
                        levelName: 'worldMap.json'
                    },
                },
                {
                    id: 'bottom-left-map',
                    roomConstructor: WorldMapRoom,
                    options: {
                        rect: [0, 250, 250, 250],
                        levelName: 'worldMap.json'
                    },
                },
                {
                    id: 'bottom-right-map',
                    roomConstructor: WorldMapRoom,
                    options: {
                        rect: [250, 250, 250, 250],
                        levelName: 'worldMap.json'
                    },
                },
            ]
        }, {
            serverId: 'insideLevels',
            areaRooms: [
                {
                    roomConstructor: CaveRoom,
                    id: 'building',
                    options: {
                        levelName: 'building.json',
                    }
                },
                {
                    id: 'cave',
                    roomConstructor: BuildingRoom,
                    options: {
                        levelName: 'cave.json',
                    }
                }
            ]
        }], // end of area servers
    }],

    // lists all available connector servers
    connector_servers: [
        'tcp://127.0.0.1:3000',
        'tcp://127.0.0.1:3001',
        'tcp://127.0.0.1:3002',
        'tcp://127.0.0.1:3003',
        'tcp://127.0.0.1:3004',
    ],

    // lists all area servers
    area_servers: [
        'tcp://127.0.0.1:4000',
        'tcp://127.0.0.1:4001',
        'tcp://127.0.0.1:4002',
        'tcp://127.0.0.1:4003',
        'tcp://127.0.0.1:4004',
    ]
};
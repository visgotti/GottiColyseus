/*
*   Example configuration file for Gotti servers.
* */

class WorldMapRoom {};

class CaveRoom {};

class BuildingRoom {};

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
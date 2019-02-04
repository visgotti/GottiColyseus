import { Config } from '../../src';
export default {
    games: {
        'test_game': {
            connectorCount: 2,
            connectorConstructorPath: '../test/mocks/Connectors/mock.ts',
            port: 8081,
            areaServers: [{
                areaRooms: [
                    {
                        id: 'test_area_1',
                        constructorPath: '../test/mocks/AreaRooms/mock1.ts',
                        options: {
                            'foo': 'bar1',
                        }
                    },
                    {
                        id: 'test_area_2',
                        constructorPath: '../test/mocks/AreaRooms/mock1.ts',
                        options: {
                            'foo': 'bar2',
                        }
                    }
                ]
            },
                {
                    areaRooms: [
                        {
                            id: 'test_area_3',
                            constructorPath: '../test/mocks/AreaRooms/mock2.ts',
                            options: {
                                'foo': 'bar3',
                            }
                        },
                        {
                            id: 'test_area_4',
                            constructorPath: '../test/mocks/AreaRooms/mock2.ts',
                            options: {
                                'foo': 'bar4',
                            }
                        }
                    ]
                }]
        },
    },
    connector_servers: [
        'tcp://127.0.0.1:3000',
        'tcp://127.0.0.1:3001',
    ],
    area_servers: [
        'tcp://127.0.0.1:4000',
        'tcp://127.0.0.1:4001',
    ],
    gate_server: 'tcp://127.0.0.1:5000',
} as Config;
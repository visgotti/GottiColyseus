import { Config } from '../../src';
import MockArea1 from '../mocks/AreaRooms/mock1';
import MockArea2 from '../mocks/AreaRooms/mock2';

export default {
    games: {
        'test_game': {
            connectorCount: 2,
            port: 8081,
            areaServers: [{
                areaRooms: [
                    {
                        id: 'test_area_1',
                        areaConstructor: MockArea1,
                        options: {
                            'foo': 'bar1',
                        }
                    },
                    {
                        id: 'test_area_2',
                        areaConstructor: MockArea1,
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
                            areaConstructor: MockArea2,
                            options: {
                                'foo': 'bar3',
                            }
                        },
                        {
                            id: 'test_area_4',
                            areaConstructor: MockArea2,
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
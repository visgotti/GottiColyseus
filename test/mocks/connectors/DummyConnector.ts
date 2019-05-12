import { Connector } from  'gotti-servers/dist';

export class GameConnector extends Connector {
    constructor(options) {
        super(options);
    }
    public onMessage(client, message: any) {
    }
    public onJoin(client, auth) {
        return { "foo": "bar" };
    }
    getInitialArea(client, auth, clientOptions) {
        console.log('running get initial area and client was', client);
        return {
            areaId: 'mock1',
            options: { x: 500, y: 500 },
        };
    }
}
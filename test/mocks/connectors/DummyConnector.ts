import { Connector } from  '../../../src/Connector';
import {IConnectorClient} from "../../../src/ConnectorClients/IConnectorClient";

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
        return {
            areaId: 'mock1',
            options: { x: 500, y: 500 },
        };
    }

    getInitialWriteArea(client: IConnectorClient, areaData, clientOptions?): { areaId: string; options: any } {
        return {areaId: "", options: undefined};
    }
}
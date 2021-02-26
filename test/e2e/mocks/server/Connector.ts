import {Connector, ConnectorOptions} from "../../../../src";

export class MockConnector extends Connector {
    constructor(opts: ConnectorOptions) {
        super(opts);
    }
    getInitialWriteArea(client, areaData, clientOptions?): { areaId: string; options: any } {
        return {areaId: "", options: undefined};
    }
    onMessage(client, message: any): void {
    }
}
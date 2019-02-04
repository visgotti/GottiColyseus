import * as path from 'path';
import { AreaRoom } from './AreaRoom';

import { BackMaster, BackChannel } from 'gotti-channels/dist';

export type PublicAreaOptions = {
    id: string,
    options: any,
}

export type AreaOption = {
    constructorPath: string,
    constructorExportName?: string,
    id: string,
    options?: PublicAreaOptions
}

export type AreaServerOptions = {
    serverIndex: number,
    areas: Array<AreaOption>,
    connectorURIs: Array<string>;
    areaURI: string;
}

export class AreaServer {
    public masterChannel: BackMaster = null;

    public areas: {[areaId: string]: AreaRoom } = {};

    constructor(options: AreaServerOptions) {
        this.masterChannel = new BackMaster(options.serverIndex);
        this.masterChannel.initialize(options.areaURI, options.connectorURIs);

        const areaIds = options.areas.map(area => {
            return area.id;
        });

        this.masterChannel.addChannels(areaIds);

        options.areas.forEach(area => {
            this.masterChannel.backChannels[area.id].connectionOptions = area.options;
            let klass = require(path.join(__dirname, area.constructorPath));

            if(klass['default']) {
                klass = klass['default'];
            } else if(area.constructorExportName) {
                klass = klass[area.constructorExportName];
            }

            const room = new klass(area.id);
            room.initializeChannels(this.masterChannel, this.masterChannel.backChannels[area.id]);
            this.areas[area.id] = room;
        });
    }

    public startPatchingState() {
        this.masterChannel.setStateUpdateInterval();
    }

    disconnect() {
        this.masterChannel.disconnect();
        this.masterChannel = null;
        for(let areaId in this.areas) {
            delete this.areas[areaId];
        }
    }
}
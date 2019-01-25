import { AreaRoom } from './AreaRoom';

import { BackMaster, BackChannel } from 'gotti-channels/dist';

export type AreaOption = {
    RoomConstructor: any,
    id: string,
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
            const room = new area.RoomConstructor(area.id);
            room.initializeChannels(this.masterChannel, this.masterChannel.backChannels[area.id])
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
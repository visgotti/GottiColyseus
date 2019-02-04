"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const dist_1 = require("gotti-channels/dist");
class AreaServer {
    constructor(options) {
        this.masterChannel = null;
        this.areas = {};
        this.masterChannel = new dist_1.BackMaster(options.serverIndex);
        this.masterChannel.initialize(options.areaURI, options.connectorURIs);
        const areaIds = options.areas.map(area => {
            return area.id;
        });
        this.masterChannel.addChannels(areaIds);
        options.areas.forEach(area => {
            this.masterChannel.backChannels[area.id].connectionOptions = area.options;
            let klass = require(path.join(__dirname, area.constructorPath));
            if (klass['default']) {
                klass = klass['default'];
            }
            else if (area.constructorExportName) {
                klass = klass[area.constructorExportName];
            }
            const room = new klass(area.id);
            room.initializeChannels(this.masterChannel, this.masterChannel.backChannels[area.id]);
            this.areas[area.id] = room;
        });
    }
    startPatchingState() {
        this.masterChannel.setStateUpdateInterval();
    }
    disconnect() {
        this.masterChannel.disconnect();
        this.masterChannel = null;
        for (let areaId in this.areas) {
            delete this.areas[areaId];
        }
    }
}
exports.AreaServer = AreaServer;

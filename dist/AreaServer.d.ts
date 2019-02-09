import { AreaRoom } from './AreaRoom';
import { BackMaster } from 'gotti-channels/dist';
export declare type AreaOption = {
    areaConstructor: any;
    id: string;
    options?: any;
};
export declare type AreaServerOptions = {
    serverIndex: number;
    areas: Array<AreaOption>;
    connectorURIs: Array<string>;
    areaURI: string;
};
export declare class AreaServer {
    masterChannel: BackMaster;
    areas: {
        [areaId: string]: AreaRoom;
    };
    constructor(options: AreaServerOptions);
    startPatchingState(): void;
    disconnect(): void;
}

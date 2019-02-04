import { AreaRoom } from './AreaRoom';
import { BackMaster } from 'gotti-channels/dist';
export declare type PublicAreaOptions = {
    id: string;
    options: any;
};
export declare type AreaOption = {
    constructorPath: string;
    constructorExportName?: string;
    id: string;
    options?: PublicAreaOptions;
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

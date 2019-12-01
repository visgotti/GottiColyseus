import { IAssetManager, S3Config } from "./IAssetManager";
export declare class S3AssetManager implements IAssetManager {
    constructor();
    init(config: S3Config): Promise<void>;
    createDirectory(directoryPath: any): Promise<boolean>;
    deleteDirectory(directoryPath: any): Promise<boolean>;
    deleteFile(pathToFile: string): Promise<boolean>;
    getFile(pathToFile: string): Promise<Buffer>;
    moveDirectory(directoryPath: string, moveTo: string): void;
    moveFile(pathToFile: any, directoryToMoveTo: any): Promise<boolean>;
    renameFile(pathToFile: any, newName: any): Promise<boolean>;
    replaceFile(pathToFile: any, newFile: Buffer): Promise<Buffer>;
    saveFile(file: Buffer, directoryPath: any, filename: any): Promise<boolean>;
}

export declare type S3Config = {
    bucket: string;
    accessKey: string;
    secretAccessKey: string;
    region: string;
};
export declare abstract class IAssetManager {
    abstract init(config: any): any;
    abstract saveFile(file: Buffer, directoryPath: any, filename: any): Promise<boolean>;
    abstract replaceFile(pathToFile: any, newFile: Buffer): Promise<Buffer>;
    abstract getFile(pathToFile: string): Promise<Buffer>;
    abstract deleteFile(pathToFile: string): Promise<boolean>;
    abstract moveFile(pathToFile: any, directoryToMoveTo: any): Promise<boolean>;
    abstract renameFile(pathToFile: any, newName: any): Promise<boolean>;
    abstract createDirectory(directoryPath: any): Promise<boolean>;
    abstract deleteDirectory(directoryPath: any): Promise<boolean>;
    abstract moveDirectory(directoryPath: string, moveTo: string): any;
}

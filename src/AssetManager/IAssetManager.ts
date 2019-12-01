export type S3Config = {
    bucket: string,
    accessKey: string,
    secretAccessKey: string,
    region: string,
}

type AssetManagerConfig = {
    s3?: S3Config,
    accessKeyId,
}

export abstract class IAssetManager {
    public abstract init(config: any)
    public abstract saveFile(file: Buffer, directoryPath, filename) : Promise<boolean>;
    public abstract replaceFile(pathToFile, newFile: Buffer) : Promise<Buffer>;
    public abstract getFile(pathToFile: string) : Promise<Buffer>;
    public abstract deleteFile(pathToFile: string) : Promise<boolean>;
    public abstract moveFile(pathToFile, directoryToMoveTo) :  Promise<boolean>;
    public abstract renameFile(pathToFile, newName) : Promise<boolean>;
    public abstract createDirectory(directoryPath) : Promise<boolean>;
    public abstract deleteDirectory(directoryPath) : Promise<boolean>;
    public abstract moveDirectory(directoryPath: string, moveTo: string)
}
import { IAssetManager } from "./IAssetManager";
const fs = require('fs');

class NodeAssetManager implements IAssetManager {
    private absPath;
    constructor() {
    }
    async init(config: any) {
        this.absPath = config.absoluteAssetsPath;
        if(!fs.existsSync(this.absPath)) {
            fs.mkdirSync(this.absPath)
        }
    }

    createDirectory(directoryPath): Promise<boolean> {
        return null;
    }

    deleteDirectory(directoryPath): Promise<boolean> {
        return undefined;
    }

    deleteFile(pathToFile: string): Promise<boolean> {
        return undefined;
    }

    getFile(pathToFile: string): Promise<Buffer> {
        return undefined;
    }

    moveDirectory(directoryPath: string, moveTo: string) {
    }

    moveFile(pathToFile, directoryToMoveTo): Promise<boolean> {
        return undefined;
    }

    renameFile(pathToFile, newName): Promise<boolean> {
        return undefined;
    }

    replaceFile(pathToFile, newFile: Buffer): Promise<Buffer> {
        return undefined;
    }

    saveFile(file: Buffer, directoryPath, filename): Promise<boolean> {
        return undefined;
    }
}
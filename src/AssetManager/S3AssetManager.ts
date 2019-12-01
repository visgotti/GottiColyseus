import { IAssetManager, S3Config } from "./IAssetManager";

const multer = require('multer');
const multerS3 = require('multer-s3');
const fs = require('fs');
const aws = require('aws-sdk');

export class S3AssetManager implements IAssetManager {
    constructor() {}
    async init(config: S3Config) {
        aws.config.update({
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretAccessKey,
            region: 'us-east-1'
        });
    }

    createDirectory(directoryPath): Promise<boolean> {
        return undefined;
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
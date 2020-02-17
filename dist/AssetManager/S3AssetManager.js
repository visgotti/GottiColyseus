"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const multer = require('multer');
const multerS3 = require('multer-s3');
const fs = require('fs');
const aws = require('aws-sdk');
class S3AssetManager {
    constructor() { }
    async init(config) {
        aws.config.update({
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretAccessKey,
            region: 'us-east-1'
        });
    }
    createDirectory(directoryPath) {
        return undefined;
    }
    deleteDirectory(directoryPath) {
        return undefined;
    }
    deleteFile(pathToFile) {
        return undefined;
    }
    getFile(pathToFile) {
        return undefined;
    }
    moveDirectory(directoryPath, moveTo) {
    }
    moveFile(pathToFile, directoryToMoveTo) {
        return undefined;
    }
    renameFile(pathToFile, newName) {
        return undefined;
    }
    replaceFile(pathToFile, newFile) {
        return undefined;
    }
    saveFile(file, directoryPath, filename) {
        return undefined;
    }
}
exports.S3AssetManager = S3AssetManager;

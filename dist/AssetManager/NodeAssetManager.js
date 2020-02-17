"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs');
class NodeAssetManager {
    constructor() {
    }
    async init(config) {
        this.absPath = config.absoluteAssetsPath;
        if (!fs.existsSync(this.absPath)) {
            fs.mkdirSync(this.absPath);
        }
    }
    createDirectory(directoryPath) {
        return null;
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
// action will be arg at index 2 and config options will be index 3
const action = JSON.parse(process.argv[2]);
const options = JSON.parse(process.argv[3]);
let areaServer = null;
if (action === 'start') {
    const klass = require(path.join(__dirname, '..', options.constructorPath));
    const room = new klass(options.id);
    const Connector = new klass(options);
}
else if (action === 'stop') {
    process.exit();
}

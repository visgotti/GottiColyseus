"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// action will be arg at index 2 and config options will be index 3
const action = JSON.parse(process.argv[2]);
const options = JSON.parse(process.argv[3]);
let areaServer = null;
if (action === 'start') {
    const klass = require(options.connectorPath);
    const Connector = new klass(options);
}
else if (action === 'stop') {
    process.exit();
}

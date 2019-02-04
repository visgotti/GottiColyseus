"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("../");
// action will be arg at index 2 and config options will be index 3
const action = process.argv[2];
const options = JSON.parse(process.argv[3]);
let areaServer = null;
if (action === 'start') {
    console.log('got options', options);
    areaServer = new __1.AreaServer(options);
    process.send('started', true);
}
else if (action === 'stop') {
    process.exit();
}

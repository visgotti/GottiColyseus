// Just importing the constructor from `jsdom` library
const JSDOM = require( 'jsdom' ).JSDOM;
declare var global: any;

const webRtc = require('wrtc');

global.window = (new JSDOM(``, { pretendToBeVisual: true,
    resources: 'usable',
    documentRoot: __dirname,
})).window;
global.Image = global.window.Image;
global.document = global['window'].document;
global.navigator = {
    userAgent: 'node.js',
};
const Storage = require('dom-storage');
global.localStorage = new Storage(null, { strict: true });
global.sessionStorage = new Storage(null, { strict: true });
Object.keys(webRtc).forEach(k => {
    global[k] = webRtc[k];
})


const fs = require('fs');
import * as assert from 'assert';
import * as mocha from 'mocha';
import * as sinon from 'sinon';
global.assert = assert;
global.sinon = sinon;
declare var XMLHttpRequest;
global.XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

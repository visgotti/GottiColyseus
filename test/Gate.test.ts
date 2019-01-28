const msgpack = require('notepack.io');
import { Gate } from '../src';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as mocha from 'mocha';

describe('Gate', () => {
    let gate;

    let mockGateUrls = ['127:0:0:1'];


    before('Creates Gate instance', (done) => {
        gate = new Gate(['127:0:0:1']);
        done();
    });

    describe('Gate.gateKeep', () => {
        before('defines handler', done => {
            gate.registerGateKeep((req, res) => {
                if(req.auth) {
                    return true;
                } else {
                    return false;
                }
            });
            done();
        });
       it('adds gateData to authenticated response',(done) =>{
           let mockReq = {
               auth: true,
           };
           let mockRes = {
               status: (code: number) => {

                   assert.strictEqual(code, 200);

                   return {
                       json: (data: any) => {
                           assert.deepStrictEqual(data, mockGateUrls);
                           done();
                       }
                   }
               }
           };
            gate.gateKeep(mockReq, mockRes);
       });
    });
});

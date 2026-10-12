const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {routeCodingTask}=load('src/shared/codingOfficePolicy.ts');
test('Vietnamese button copy routes to one FE seat and no manager',()=>{const r=routeCodingTask({repo:'FE',prompt:'Đổi chữ button Login thành A'});assert.equal(r.tier,'XS');assert.deepEqual(r.roles,['frontend']);assert.equal(r.manager,false);assert.equal(r.reviewRequired,false);});
test('payment risk overrides an XS request',()=>{const r=routeCodingTask({repo:'BE',prompt:'Change payment authorization',tier:'XS'});assert.equal(r.tier,'M');assert.equal(r.reviewRequired,true);});
test('explicit large feature is bounded without activating unrelated workers',()=>{const r=routeCodingTask({repo:'BE',prompt:'Payment stages',tier:'L'});assert.equal(r.tier,'L');assert.equal(r.automaticRetries,0);assert.equal(r.retries,3);assert.equal(r.seconds,1800);assert.deepEqual(r.roles,['backend']);});

test('authentication and password changes are elevated even when small',()=>{for(const prompt of ['Fix auth bug','Update password validation']){const r=routeCodingTask({repo:'FE',prompt,tier:'S'});assert.equal(r.tier,'M');assert.equal(r.reviewRequired,true);}});

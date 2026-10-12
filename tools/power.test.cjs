const test = require('node:test');
const assert = require('node:assert/strict');
const createPower = require('../js/power.js');

test('natural outage, complete darkness, staggered restoration, second outage', () => {
  const p=createPower(()=>0);
  assert.equal(p.update(24),1);
  assert.equal(p.update(1),0);
  assert.equal(p.state().phase,'off');
  assert.equal(p.update(3.9),0);
  p.update(.2);
  assert.equal(p.state().phase,'restoring');
  assert.ok(p.state().supply>0 && p.state().supply<1);
  p.update(3.5);
  assert.equal(p.state().supply,1);
  assert.equal(p.state().phase,'on');
  assert.equal(p.update(45),0);
});
test('elapsed time works at low frame rates and zero dt pauses the event',()=>{
  const p=createPower(()=>.5);
  for(let i=0;i<150;i++) p.update(.25);
  assert.equal(p.state().phase,'off');
  p.update(0);
  assert.equal(p.state().elapsed,0);
  p.update(6.5);
  assert.equal(p.state().phase,'restoring');
  p.update(3.5);
  assert.equal(p.state().supply,1);
});
test('a new outage during recovery cuts supply immediately',()=>{
  const p=createPower(()=>.5);
  p.trigger(1);p.update(2);
  assert.ok(p.state().supply>0);
  p.trigger(2);
  assert.equal(p.state().supply,0);
  p.update(5.5);
  assert.equal(p.state().supply,1);
});

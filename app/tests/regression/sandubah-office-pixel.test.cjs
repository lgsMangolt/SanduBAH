'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
test('office modules preserve every agent with four desks per block',async()=>{
  const {officeBlocks}=await import('../../src/sandubah-desktop/office-pixel.mjs');
  for(const count of [0,1,4,5,16]){
    const agents=Array.from({length:count},(_,index)=>({id:String(index)}));
    const blocks=officeBlocks({id:'harness',agents});assert.equal(blocks.length,Math.max(1,Math.ceil(count/4)));assert.deepEqual(blocks.flatMap(block=>block.agents),agents);
    assert.equal(new Set(blocks.map(block=>block.id)).size,blocks.length);
  }
});
test('handoff requires completed dependency and a real transition between different agents',async()=>{
  const {officeHandoffs}=await import('../../src/sandubah-desktop/office-pixel.mjs');
  const previous={agents:[{id:'from'},{id:'to'}],missions:[{id:'first',agentId:'from',status:'done',title:'Plano'},{id:'next',agentId:'to',status:'pending',dependsOn:'first'}]};
  const current=structuredClone(previous);current.missions[1].status='running';current.missions[1].startedAt='now';
  assert.equal(officeHandoffs(previous,current).length,1);
  assert.equal(officeHandoffs(current,current).length,0);assert.equal(officeHandoffs(null,current).length,0);
  current.missions[0].status='error';assert.equal(officeHandoffs(previous,current).length,0);
  current.missions[0].status='done';current.missions[1].agentId='from';assert.equal(officeHandoffs(previous,current).length,0);
  current.missions[1].agentId='missing';assert.equal(officeHandoffs(previous,current).length,0);
});
test('office seating anchors hips to real chairs, separates rest places and faces the table',async()=>{
  const {officeSeats,officeSeat,spritePlacement,chairBacks}=await import('../../src/sandubah-desktop/office-seating.mjs');
  assert.equal(chairBacks.length,4);
  assert.equal(new Set(officeSeats.lounge.map(seat=>`${seat.left}:${seat.top}`)).size,4);
  for(let index=0;index<4;index++){
    for(const state of ['running','pending','error','unknown'])assert.deepEqual(officeSeat(index,state),officeSeats.desks[index]);
    for(const state of ['idle','done'])assert.deepEqual(officeSeat(index,state),officeSeats.lounge[index]);
    for(const seat of [officeSeats.desks[index],officeSeats.lounge[index]]){
      const rectangle=spritePlacement(seat);assert.ok(Math.abs(rectangle.top+rectangle.height*(seat.hipAnchor??.72)-seat.top)<.001);assert.equal(rectangle.left+rectangle.width/2,seat.left);
      assert.ok(rectangle.left>=0&&rectangle.left+rectangle.width<=960);assert.ok(rectangle.top>=0&&rectangle.top+rectangle.height<=640);
    }
  }
  assert.equal(officeSeats.lounge[2].flip,false);
  assert.throws(()=>officeSeat(4,'idle'),RangeError);
  const walking=spritePlacement({left:400,top:500},true);assert.equal(walking.top+walking.height*.95,500);
});
test('office activity poses use distinct interactions, two frames and motion control',async()=>{
  const {officePose}=await import('../../src/sandubah-desktop/office-seating.mjs');
  const intervals=[450,1800,2200,2600];
  assert.deepEqual(intervals.map((_,index)=>officePose(index,'idle').activity),['arcade','chimarrao','servir','leitura']);
  for(let index=0;index<4;index++){
    const first=officePose(index,'idle',0),second=officePose(index,'done',intervals[index]);
    assert.equal(first.sheet,'gaucho-activities');assert.equal(first.row,0);assert.equal(second.row,1);
    assert.equal(officePose(index,'idle',intervals[index],false).row,0);
    assert.equal(officePose(index,'idle',intervals[index]*2).row,0);
    for(const state of ['running','pending','error','unknown']){
      assert.equal(officePose(index,state).activity,'computador');assert.equal(officePose(index,state).sheet,'gaucho-agents');
    }
    assert.equal(officePose(index,'done',0,true,true).activity,'entrega');
    assert.equal(officePose(index,'done',0,true,true).row,1);
    assert.ok(first.column+first.inset>=0&&first.column+1+first.extension<=4);
  }
  const arcade=officePose(0,'idle'),mate=officePose(1,'idle');
  assert.equal(arcade.column+1+arcade.extension,mate.column+mate.inset);
});

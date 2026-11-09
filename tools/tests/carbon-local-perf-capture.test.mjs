import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../carbon-perf-capture.js', import.meta.url), 'utf8');
const reporter = fs.readFileSync(new URL('../../source/web/report.js', import.meta.url), 'utf8');
function fixture(enabled = true) {
  let now = 0, timer, removed = 0, calls = 0, receiver;
  const logs = [], warnings = [], handlers = {};
  const source = {enabled,
    frame(...args) { calls++; receiver = this; return args[0]; },
    render() {}, gpu() {}, audio() {}};
  const c = {window:null, performance:{now:()=>now,timeOrigin:1800000000000}, document:{hidden:false,
    addEventListener:(name,fn)=>{ handlers[name]=fn; },
    removeEventListener:(name,fn)=>{ if (handlers[name]===fn) removed++; }},
    console:{log:(...args)=>logs.push(args),warn:(...args)=>warnings.push(args)},
    setTimeout:fn=>{timer=fn;return 1;}, clearTimeout() {}, recompPerformance:source};
  c.window = c;
  vm.runInNewContext(script,c);
  return {c, source, logs, warnings, handlers, advance(v){now=v;}, runTimer(){timer();},
          get calls(){return calls;}, get receiver(){return receiver;}, get removed(){return removed;}};
}

test('captures genuine callback data without changing handlers or sending information',()=>{
  const f=fixture(), {c,source}=f;
  assert.equal(c.carbonPerfCapture.running,true);
  f.advance(1000); source.frame(1000,-1,1,1280,720,0,0,0,0,0,0,0,0);
  assert.equal(f.calls,1); assert.equal(f.receiver,source);
  f.advance(9000); source.gpu(1800000000000+7000,99,12); // late GPU result from before capture
  for(let i=0;i<1800;i++) {
    const t=8000+(i+1)*1000/60;
    f.advance(t);
    const fresh=i%4!==0;
    source.frame(1800000000000+t,-1,1,1280,720,fresh?0:1,1,2,3,4,5,6,7);
    if(fresh) source.render(1800000000000+t,6,2,1);
    if(i%120===0) source.gpu(1800000000000+t,2.5,12);
  }
  f.advance(38000); f.runTimer();
  const out=c.carbonPerfCapture.result;
  assert.equal(out.newFrames,1349); assert.equal(out.repeats,450);
  assert.equal(out.newFps,44.97); assert.equal(out.perNewFrameMs.guestSleepOverrun,6);
  assert.equal(out.render.meanEncodeMs,6); assert.equal(out.gpu.meanRenderPassMs,2.5);
  assert.equal(out.sceneChanges,0); assert.equal(out.hiddenEvents,0);
  assert.equal(out.drawableWidth,1280); assert.equal(out.drawableHeight,720);
  assert.equal(c.carbonPerfCapture.running,false); assert.equal(f.removed,1);
  assert.equal(source.frame(123),123,'original callback is restored');
  assert.ok(f.logs.some(row=>typeof row[0]==='string' && row[0].includes('carbon-local-performance')));
  assert.doesNotMatch(JSON.stringify(out),/player|token|url|name/i);
});

test('does not start without enabled runtime callbacks',()=>{
  const f=fixture(false);
  assert.equal(f.c.carbonPerfCapture,undefined);
  assert.match(f.warnings[0][0],/unavailable or stopped/);
});

test('records hidden tabs and scene changes, and never overwrites a later handler',()=>{
  const f=fixture(), {c,source}=f;
  f.advance(9000); source.frame(9000,-1,1,1280,720,0,0,0,0,0,0,0,0);
  f.advance(10000); source.frame(10000,-1,2,1280,720,0,0,0,0,0,0,0,0);
  c.document.hidden=true; f.handlers.visibilitychange(); c.document.hidden=false;
  const replacement=()=>123; source.render=replacement; source.enabled=false;
  f.advance(11000); const out=c.carbonPerfCapture.stop();
  assert.equal(out.sceneChanges,1); assert.equal(out.hiddenEvents,1); assert.equal(out.collectorStopped,true);
  assert.equal(source.render,replacement);
});

test('wraps the actual reporter callback contract and leaves it working',()=>{
  let now=0, timeout, intervals=[];
  const logs=[], events={};
  const c={window:null, performance:{now:()=>now,timeOrigin:1800000000000},
    URL,URLSearchParams,TextEncoder,Uint32Array,Date,Math,devicePixelRatio:2,
    sessionStorage:{getItem:()=>null,setItem(){}},localStorage:{getItem:()=>null,setItem(){}},
    document:{hidden:false,getElementById:()=>null,addEventListener:(k,v)=>{events[k]=v;},removeEventListener(){}},
    console:{log:(...args)=>logs.push(args),info(){},warn(){},error(){}},
    addEventListener(){}, setInterval:(fn,ms)=>{intervals.push({fn,ms});},clearInterval(){},
    setTimeout:fn=>{timeout=fn;return 1;},clearTimeout(){},
    location:new URL('https://example.test/'),recompSite:true,navigator:{userAgent:'test'},
    screen:{width:1280,height:720},innerWidth:1280,innerHeight:720};
  c.window=c; vm.runInNewContext(reporter,c);
  const realFrame=c.recompPerformance.frame;
  vm.runInNewContext(script,c);
  for(let second=0;second<38;second++) {
    for(let i=0;i<60;i++) {
      now=second*1000+(i+1)*1000/60;
      const fresh=Math.floor((i+1)*43/60)>Math.floor(i*43/60);
      c.recompPerformance.frame(1800000000000+now,2,1,1280,720,fresh?0:1,1,2,3,4,5,6,7);
      if(fresh)c.recompPerformance.render(1800000000000+now,6,2,1);
    }
    now=(second+1)*1000;
    for(const t of intervals)if(t.ms===1000)t.fn();
  }
  timeout();
  assert.ok(Math.abs(c.carbonPerfCapture.result.newFps-43)<0.1);
  assert.equal(c.carbonPerfCapture.result.perNewFrameMs.guestSleepOverrun,6);
  assert.equal(c.recompPerformance.frame,realFrame);
  assert.equal(c.recompPerformance.enabled,true);
  assert.ok(logs.some(row=>typeof row[0]==='string' && row[0].includes('carbon-local-performance')));
});

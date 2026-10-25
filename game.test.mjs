import test from 'node:test';
import assert from 'node:assert/strict';
import { stage, createGame, reserve, advance, preview, activateBuoy, recordScore, leaderboard, solve, DIRS } from './logic.mjs';

const play = (g, n) => { for(let i=0;i<n && g.status==='playing';i++) advance(g); return g; };

test('30 stages are distinct, increasingly complex, and have a complete solvable route', () => {
  const levels = Array.from({length:30},(_,i)=>stage(i+1));
  assert.equal(new Set(levels.map(x=>x.signature)).size,30);
  for (let i=0;i<30;i++) {
    assert.equal(levels[i].number,i+1);
    const path = solve(levels[i]);
    assert.ok(path.length >= 9, `stage ${i+1}: route`);
    assert.deepEqual(path.at(-1), levels[i].dock);
    const g=createGame(levels[i]);
    for(const turn of levels[i].turns) reserve(g,turn.x,turn.y,turn.orientation);
    play(g, 60);
    assert.equal(g.status,'won', `stage ${i+1}: ${g.reason} at ${g.ship.x},${g.ship.y}`);
  }
  assert.ok(levels[29].rocks.length > levels[0].rocks.length);
  assert.ok(levels[29].turns.length >= levels[0].turns.length);
});

test('routes change actionable topology, entrances and exits across progression', () => {
  const levels=Array.from({length:30},(_,i)=>stage(i+1));
  const headings=levels.map(l=>l.turns.map(t=>`${t.incoming}>${t.outgoing}`).join('|'));
  const shapes=levels.map(l=>l.route.map((p,i)=>i?`${p.x-l.route[i-1].x},${p.y-l.route[i-1].y}`:'').filter(Boolean).join('|'));
  assert.ok(new Set(headings).size>=12, 'turn decisions cannot be one serpentine script');
  assert.ok(new Set(shapes).size>=20, 'paths must differ in actual traversed cells');
  assert.ok(new Set(levels.map(l=>`${l.start.x},${l.start.y},${l.start.dir}`)).size>=4);
  assert.ok(new Set(levels.map(l=>`${l.dock.x},${l.dock.y}`)).size>=12);
  assert.ok(new Set(levels.map(l=>`${l.turns[0].x},${l.turns[0].y}`)).size>=12);
  for(const l of levels){
    assert.equal(l.route.length, new Set(l.route.map(p=>`${p.x},${p.y}`)).size, 'route must not revisit cells');
    assert.deepEqual(solve(l),l.route,`stage ${l.number}: solution must come from simulation`);
  }
});

test('hazards punish alternate turn decisions and current amplification', () => {
  const levels=Array.from({length:30},(_,i)=>stage(i+1));
  let threatened=0, currents=0;
  for(const l of levels){
    for(const t of l.turns){
      const k=`${t.x},${t.y}`;
      const wrong=Array.from({length:4},(_,o)=>o).filter(o=>o!==t.orientation);
      for(const orientation of wrong){
        const g=createGame(l); g.ship={x:t.x-DIRS[t.incoming][0],y:t.y-DIRS[t.incoming][1],dir:t.incoming};
        g.lenses[k].orientation=orientation;
        advance(g); if(g.status!=='playing')continue;
        advance(g); if(g.status==='lost') {threatened++;break}
      }
    }
    const b=l.buoys.find(b=>b.kind==='current');
    if(b){const idx=l.route.findIndex(p=>p.x===b.x&&p.y===b.y);const dir=l.route[idx+1]&&DIRS.findIndex(([dx,dy])=>dx===l.route[idx+1].x-b.x&&dy===l.route[idx+1].y-b.y);
      if(dir===b.dir){const g=createGame(l);g.ship={x:b.x-DIRS[dir][0],y:b.y-DIRS[dir][1],dir};activateBuoy(g,b.x,b.y);advance(g);advance(g);if(g.status==='lost')currents++}
    }
  }
  assert.ok(threatened>=35,`only ${threatened} threatened decisions`);
  assert.ok(currents>=20,`only ${currents} dangerous amplified currents`);
});

test('endless seeds generate different directional layouts with simulated solutions', () => {
  const levels=Array.from({length:24},(_,i)=>stage('endless',i+100));
  assert.ok(new Set(levels.map(l=>l.turns.map(t=>t.incoming+'>'+t.outgoing).join('|'))).size>=10);
  assert.ok(new Set(levels.map(l=>`${l.start.x},${l.start.y},${l.start.dir}`)).size>=4);
  for(const l of levels) assert.deepEqual(solve(l),l.route,`seed ${l.seed}`);
});

test('nearby stages require different opening rotations, not only decorative rocks', () => {
  const openings=Array.from({length:5},(_,i)=>{const g=createGame(stage(i+1)), t=g.level.turns[0];return g.lenses[`${t.x},${t.y}`].orientation});
  assert.ok(new Set(openings).size>=3);
});

test('reservation stays pending until two beats have elapsed', () => {
  const g=createGame(stage(1)); const t=g.level.turns[0];
  assert.notEqual(g.lenses[`${t.x},${t.y}`].orientation,t.orientation);
  reserve(g,t.x,t.y,t.orientation);
  assert.equal(g.pending[0].at,2);
  advance(g); assert.notEqual(g.lenses[`${t.x},${t.y}`].orientation,t.orientation);
  advance(g); assert.equal(g.lenses[`${t.x},${t.y}`].orientation,t.orientation);
});

test('queue preserves order and preview never mutates the game', () => {
  const g=createGame(stage(2)); const t=g.level.turns[0];
  reserve(g,t.x,t.y,0); reserve(g,t.x,t.y,2);
  const before=JSON.stringify(g);
  const predicted=preview(g,5);
  assert.equal(JSON.stringify(g),before);
  assert.equal(predicted.length,5);
  advance(g); advance(g);
  assert.equal(g.lenses[`${t.x},${t.y}`].orientation,2);
});

test('all three lens types alter headings as documented', () => {
  const g=createGame(stage(30));
  for (const [type, orientation, incoming, expected] of [['beacon',1,0,1],['mirror',0,0,1],['mirror',1,0,3],['reverser',0,0,2]]) {
    const t=g.level.turns[0];
    g.ship={x:t.x-DIRS[incoming][0],y:t.y-DIRS[incoming][1],dir:incoming}; g.lenses[`${t.x},${t.y}`]={type,orientation}; g.pending=[]; g.beat=0; g.status='playing';
    advance(g); assert.equal(g.ship.dir,expected,`${type}/${orientation}`);
  }
});

test('all four buoy mechanics and amplification', () => {
  for(const kind of ['star','battery','shield','current']) {
    const g=createGame(stage(1)); g.ship={x:0,y:1,dir:0};g.level.rocks=[];g.level.dock={x:8,y:6};g.level.buoys=[{x:1,y:1,kind}];
    activateBuoy(g,1,1); advance(g);
    assert.equal(g.visited.length,1);
    if(kind==='star') assert.equal(g.bonus,60);
    if(kind==='battery') assert.equal(g.fastCharges,2);
    if(kind==='shield') assert.equal(g.shields,2);
    if(kind==='current') assert.equal(g.ship.dir,1);
  }
});

test('rocks and boundaries cause loss, shield protects one collision', () => {
  const g=createGame(stage(1));g.ship={x:0,y:1,dir:0}; g.level.rocks=[{x:1,y:1}]; advance(g);
  assert.equal(g.status,'lost');
  const h=createGame(stage(1));h.ship={x:0,y:1,dir:0}; h.level.rocks=[{x:1,y:1}]; h.shields=1; advance(h);
  assert.equal(h.status,'playing'); assert.equal(h.shields,0); assert.deepEqual([h.ship.x,h.ship.y],[0,1]);
  const edge=createGame(stage(1)); edge.ship={x:8,y:0,dir:0}; advance(edge); assert.equal(edge.status,'lost');
});

test('seeded endless levels repeat and different seeds vary', () => {
  assert.equal(stage('endless',42).signature,stage('endless',42).signature);
  assert.notEqual(stage('endless',42).signature,stage('endless',43).signature);
  const l=stage('endless',42), g=createGame(l);
  for(const t of l.turns) reserve(g,t.x,t.y,t.orientation);
  play(g,60); assert.equal(g.status,'won');
});

test('local board ranks, caps, separates modes and rejects invalid storage', () => {
  let data=''; const store={getItem:()=>data,setItem:(_,v)=>{data=v}};
  for(let i=0;i<12;i++) recordScore(store,{mode:'stage',stage:1,score:i,name:'항해자'});
  assert.equal(leaderboard(store,'stage').length,10);
  assert.equal(leaderboard(store,'stage')[0].score,11);
  assert.equal(leaderboard(store,'endless').length,0);
  data='garbage'; assert.deepEqual(leaderboard(store,'stage'),[]);
});

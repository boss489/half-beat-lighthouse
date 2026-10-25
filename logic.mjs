// Deterministic beat-by-beat rules; no browser globals in this module.
export const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const key=(x,y)=>`${x},${y}`;
const rng=seed=>{let s=(Number(seed)>>>0)||1;s=Math.imul(s^(s>>>16),0x7feb352d);s=Math.imul(s^(s>>>15),0x846ca68b);s=(s^(s>>>16))>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296)};
const lensDirection=(type,o,dir)=>type==='beacon'?o:type==='mirror'?(dir+(o%2===0?1:3))%4:(dir+o+2)%4;

export function stage(number,seed=0){
  const endless=number==='endless';
  if(!endless && (!Number.isInteger(number)||number<1||number>30)) throw Error('Stage must be 1–30');
  const levelNo=endless?30:number;
  const random=rng(endless?seed+9973:Math.imul(number,8147));
  const segments=levelNo<=5?1:levelNo<=12?2:levelNo<=20?3:4;
  const inside=(x,y)=>x>=0&&x<9&&y>=0&&y<7;
  const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]]}return items};
  // Construct a self-avoiding polyline from a random coast. Each bend is a real lens decision.
  let layout;
  for(let attempt=0;attempt<300&&!layout;attempt++){
    const side=Math.floor(random()*4), edge=Math.floor(random()*(side%2?9:7));
    const start=side===0?{x:0,y:edge,dir:0}:side===1?{x:edge,y:0,dir:1}:side===2?{x:8,y:edge,dir:2}:{x:edge,y:6,dir:3};
    const route=[{x:start.x,y:start.y}], used=new Set([key(start.x,start.y)]), turns=[];
    function extend(x,y,dir,bends){
      const minimum=bends===0||segments===1?4:2;
      const lengths=shuffle(Array.from({length:6-minimum+1},(_,i)=>i+minimum));
      for(const length of lengths){
        let cx=x,cy=y;const cells=[];
        for(let i=0;i<length;i++){
          cx+=DIRS[dir][0];cy+=DIRS[dir][1];
          if(!inside(cx,cy)||used.has(key(cx,cy)))break;
          cells.push({x:cx,y:cy});
        }
        if(cells.length!==length)continue;
        for(const p of cells){route.push(p);used.add(key(p.x,p.y))}
        if(bends===segments){
          const viable=route.slice(1,-1).some((p,i)=>{
            const prev=route[i],next=route[i+2];
            if(turns.some(t=>t.x===p.x&&t.y===p.y))return false;
            const dir=DIRS.findIndex(([dx,dy])=>p.x-prev.x===dx&&p.y-prev.y===dy&&next.x-p.x===dx&&next.y-p.y===dy);
            if(dir<0)return false;
            const [dx,dy]=DIRS[(dir+1)%4];return inside(p.x+dx,p.y+dy)&&!used.has(key(p.x+dx,p.y+dy));
          });
          if(viable){layout={start,route:route.map(p=>({...p})),turns:turns.map(t=>({...t}))};return true}
        }
        if(bends<segments)for(const next of shuffle([(dir+1)%4,(dir+3)%4])){
          turns.push({x:cx,y:cy,incoming:dir,outgoing:next});
          if(extend(cx,cy,next,bends+1))return true;
          turns.pop();
        }
        for(const p of cells)used.delete(key(p.x,p.y));
        route.length-=cells.length;
      }
      return false;
    }
    extend(start.x,start.y,start.dir,0);
  }
  if(!layout)throw Error('Cannot generate navigable route');
  const {start,route}=layout,dock={...route.at(-1)},occupied=new Set(route.map(p=>key(p.x,p.y)));
  const turns=layout.turns.map((t,i)=>{
    const type=levelNo<=5?'beacon':levelNo<=12?(i%2?'mirror':'beacon'):levelNo<=20?(i%3===2?'reverser':i%2?'mirror':'beacon'):['beacon','mirror','reverser','beacon'][i];
    const orientation=Array.from({length:4},(_,o)=>o).find(o=>lensDirection(type,o,t.incoming)===t.outgoing);
    return {...t,type,orientation};
  });
  const forbidden=new Set([key(start.x,start.y),key(dock.x,dock.y),...turns.map(t=>key(t.x,t.y))]);
  const straight=route.slice(1,-1).map((p,i)=>({p,i:i+1})).filter(({p,i})=>!forbidden.has(key(p.x,p.y))&&
    DIRS.some(([dx,dy])=>route[i-1].x+dx===p.x&&route[i-1].y+dy===p.y&&p.x+dx===route[i+1].x&&p.y+dy===route[i+1].y));
  const currentSlot=straight.find(({p,i})=>{const dir=DIRS.findIndex(([dx,dy])=>p.x+dx===route[i+1].x&&p.y+dy===route[i+1].y);
    const side=DIRS[(dir+1)%4];return inside(p.x+side[0],p.y+side[1])&&!occupied.has(key(p.x+side[0],p.y+side[1]))});
  if(!currentSlot)throw Error('Route lacks current hazard');
  const currentDir=DIRS.findIndex(([dx,dy])=>currentSlot.p.x+dx===route[currentSlot.i+1].x&&currentSlot.p.y+dy===route[currentSlot.i+1].y);
  const buoys=[{...currentSlot.p,kind:'current',dir:currentDir}];
  const choices=shuffle(route.slice(1,-1).filter(p=>!forbidden.has(key(p.x,p.y))&&key(p.x,p.y)!==key(currentSlot.p.x,currentSlot.p.y)));
  for(const kind of ['star','battery','shield']){const p=choices.pop();if(p)buoys.push({...p,kind})}
  const rocks=[],blocked=new Set(occupied);
  function addRock(x,y){const k=key(x,y);if(inside(x,y)&&!blocked.has(k)){rocks.push({x,y});blocked.add(k)}}
  const side=DIRS[(currentDir+1)%4];addRock(currentSlot.p.x+side[0],currentSlot.p.y+side[1]);
  for(const t of turns){
    // Wrong turns have immediate consequences; never obstruct the authored safe path.
    const wrong=shuffle([(t.incoming+1)%4,(t.incoming+3)%4,t.incoming].filter(d=>d!==t.outgoing));
    for(const dir of wrong){const [dx,dy]=DIRS[dir];if(inside(t.x+dx,t.y+dy)&&!blocked.has(key(t.x+dx,t.y+dy))){addRock(t.x+dx,t.y+dy);break}}
  }
  const count=Math.min(3+levelNo,22);
  for(let n=0;n<150&&rocks.length<count;n++) addRock(Math.floor(random()*9),Math.floor(random()*7));
  const signature=JSON.stringify({number,endless,seed,turns,rocks,buoys,dock});
  return {number:endless?'endless':number,seed:endless?seed:null,width:9,height:7,start,dock,turns,rocks,buoys,route,signature};
}
export function createGame(level){
  const lenses={}; for(const [i,t] of level.turns.entries()) lenses[key(t.x,t.y)]={type:t.type,orientation:(t.orientation+(t.type==='mirror'?1:1+((Number(level.number)||level.seed||1)+i-1)%3))%4};
  return {level,ship:{...level.start},lenses,pending:[],beat:0,status:'playing',reason:'',score:0,bonus:0,shields:0,fastCharges:0,visited:[],amplified:[],bumps:0};
}
export function reserve(g,x,y,orientation){
  if(g.status!=='playing'||!g.lenses[key(x,y)]||!Number.isInteger(orientation)||orientation<0||orientation>3)return false;
  g.pending.push({x,y,orientation,at:g.beat+(g.fastCharges?1:2)});
  if(g.fastCharges)g.fastCharges--;
  return true;
}
export function activateBuoy(g,x,y){
  const k=key(x,y);
  if(g.status!=='playing'||!g.level.buoys.some(b=>key(b.x,b.y)===k)||g.visited.includes(k))return false;
  if(g.amplified.includes(k))g.amplified=g.amplified.filter(v=>v!==k);
  else g.amplified.push(k);
  return true;
}
export function advance(g){
  if(g.status!=='playing')return g;
  g.beat++;
  for(const p of g.pending.filter(p=>p.at<=g.beat))g.lenses[key(p.x,p.y)].orientation=p.orientation;
  g.pending=g.pending.filter(p=>p.at>g.beat);
  const [dx,dy]=DIRS[g.ship.dir], nx=g.ship.x+dx,ny=g.ship.y+dy;
  if(nx<0||nx>=g.level.width||ny<0||ny>=g.level.height||g.level.rocks.some(r=>r.x===nx&&r.y===ny)){
    if(g.shields){g.shields--;g.bumps++;g.reason='보호막이 충돌을 막았습니다';return g}
    g.status='lost';g.reason='암초 또는 항구 경계에 충돌했습니다';return g;
  }
  g.ship.x=nx;g.ship.y=ny;
  if(nx===g.level.dock.x&&ny===g.level.dock.y){g.status='won';g.score=Math.max(100,1000+g.bonus-g.beat*12-g.bumps*35);g.reason='안전하게 입항했습니다';return g}
  const k=key(nx,ny),lens=g.lenses[k];
  if(lens)g.ship.dir=lensDirection(lens.type,lens.orientation,g.ship.dir);
  const buoy=g.level.buoys.find(b=>key(b.x,b.y)===k);
  if(buoy&&!g.visited.includes(k)){
    g.visited.push(k);const amp=g.amplified.includes(k);
    if(buoy.kind==='star')g.bonus+=amp?60:30;
    if(buoy.kind==='battery')g.fastCharges+=amp?2:1;
    if(buoy.kind==='shield')g.shields+=amp?2:1;
    if(buoy.kind==='current')g.ship.dir=amp?((buoy.dir??0)+1)%4:(buoy.dir??0);
  }
  return g;
}
export function preview(g,n=5){const copy=structuredClone(g),path=[];for(let i=0;i<n&&copy.status==='playing';i++){advance(copy);path.push({x:copy.ship.x,y:copy.ship.y,dir:copy.ship.dir,status:copy.status,beat:copy.beat})}return path}
export function solve(level){
  const game=createGame(level),path=[{x:game.ship.x,y:game.ship.y}];
  for(const turn of level.turns)if(!reserve(game,turn.x,turn.y,turn.orientation))throw Error('Cannot reserve route');
  for(let step=0;step<level.width*level.height&&game.status==='playing';step++){
    advance(game);if(game.status!=='lost')path.push({x:game.ship.x,y:game.ship.y});
  }
  if(game.status!=='won')throw Error(`Unsolvable route: ${game.reason||'timed out'}`);
  return path;
}
const STORAGE_KEY='half-beat-lighthouse-scores-v1';
export function leaderboard(storage,mode){try{const raw=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');return Array.isArray(raw)?raw.filter(r=>r&&r.mode===mode&&Number.isFinite(r.score)).sort((a,b)=>b.score-a.score).slice(0,10):[]}catch{return []}}
export function recordScore(storage,{mode,stage:stageNo,score,name}){
  if(!['stage','endless'].includes(mode)||!Number.isFinite(score))return false;
  try{const entries=[...leaderboard(storage,'stage'),...leaderboard(storage,'endless'),{mode,stage:stageNo,score:Math.max(0,Math.floor(score)),name:String(name||'항해자').slice(0,16),date:new Date().toISOString()}];
    storage.setItem(STORAGE_KEY,JSON.stringify(entries.filter(e=>e.mode==='stage').sort((a,b)=>b.score-a.score).slice(0,10).concat(entries.filter(e=>e.mode==='endless').sort((a,b)=>b.score-a.score).slice(0,10))));return true
  }catch{return false}
}

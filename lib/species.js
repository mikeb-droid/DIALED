// ============================================================
// lib/species.js  —  fish habitat scoring
// ============================================================
import { gvBil } from './ocean.js';

export function lunarPhase(date = new Date()) {
  const known=new Date('2024-01-11T00:00:00Z'), cycle=29.53058867;
  const phase=((( (date-known)/(864e5) )%cycle)+cycle)%cycle/cycle;
  const names=['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous',
               'Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
  return {
    phase,
    pct:  Math.round((1-Math.abs(1-phase*2))*100),
    name: names[Math.floor(phase*8)%8],
    solunar: Math.round((Math.cos(phase*2*Math.PI)+1)/2*100),
  };
}

export const FISH = [
  {id:'mahi',minOff:0.30,maxOff:2.0, name:'Mahi-Mahi',    icon:'🐬', c:'#00e5ff',
   sst:[75,84],chl:[.10,.80],dep:[91,600],
   w:{sst:.30,chl:.25,dep:.30,lunar:.10,tidal:.05}, lunarSensitivity:.7,
   tip:'Gulf Stream edge and weed lines 10-30mi offshore. Best May-Sep east of 600ft line.'},
  {id:'sail',minOff:0.10,maxOff:0.45, name:'Sailfish',     icon:'⚡',  c:'#cc88ff',
   sst:[74,83],chl:[.05,.50],dep:[30,200],
   w:{sst:.35,chl:.20,dep:.30,lunar:.10,tidal:.05}, lunarSensitivity:.8,
   tip:'FL Sailfish Capital. Peak Nov-Apr. Shelf break 100-300ft. Palm Beach to Miami prime.'},
  {id:'wahoo',minOff:0.50,maxOff:3.0,name:'Wahoo',        icon:'🚀', c:'#ff8822',
   sst:[72,82],chl:[.05,.40],dep:[600,3000],
   w:{sst:.30,chl:.20,dep:.40,lunar:.05,tidal:.05}, lunarSensitivity:.4,
   tip:'Deep offshore 600-3000ft. Current edges key. Burn baits fast fall-spring.'},
  {id:'bft',minOff:0.15,maxOff:1.0,  name:'Blackfin Tuna',icon:'🐟', c:'#22ddee',
   sst:[72,80],chl:[.20,1.50],dep:[50,400],
   w:{sst:.35,chl:.25,dep:.25,lunar:.10,tidal:.05}, lunarSensitivity:.6,
   tip:'Reef edges and color breaks 80-600ft. Best near SST temp breaks.'},
  {id:'king',minOff:0.05,maxOff:0.18, name:'Kingfish',     icon:'👑', c:'#ffdd00',
   sst:[68,80],chl:[.50,2.50],dep:[20,120],
   w:{sst:.25,chl:.30,dep:.25,lunar:.10,tidal:.10}, lunarSensitivity:.5, tidalPreference:'incoming',
   tip:'Nearshore reefs 30-200ft. High chl = bait = kings. Spring and fall peak.'},
  {id:'cobia',minOff:0.02,maxOff:0.12,name:'Cobia',        icon:'🦈', c:'#88dd00',
   sst:[68,78],chl:[.80,3.50],dep:[0,80],
   w:{sst:.25,chl:.20,dep:.20,lunar:.15,tidal:.20}, lunarSensitivity:.7, tidalPreference:'incoming',
   tip:'Follow rays near nearshore markers. Spring migration Mar-May.'},
  {id:'snap',minOff:0.08,maxOff:0.35, name:'Snapper',      icon:'🔴', c:'#ff7777',
   sst:[65,82],chl:[.40,2.50],dep:[40,300],
   w:{sst:.20,chl:.20,dep:.30,lunar:.20,tidal:.10}, lunarSensitivity:.9, tidalPreference:'outgoing',
   tip:'Reefs and wrecks 60-600ft. Night fishing. New/full moon critical.'},
  {id:'grp',minOff:0.08,maxOff:0.35,  name:'Grouper',      icon:'🟫', c:'#dd9933',
   sst:[62,78],chl:[.50,3.00],dep:[40,200],
   w:{sst:.25,chl:.20,dep:.35,lunar:.15,tidal:.05}, lunarSensitivity:.6,
   tip:'Deep ledges and wrecks 60-300ft. Cooler months push fish shallower.'},
  {id:'aj',minOff:0.10,maxOff:0.40,   name:'Amberjack',    icon:'⚓', c:'#ffaa44',
   sst:[68,82],chl:[.40,2.00],dep:[60,250],
   w:{sst:.25,chl:.15,dep:.40,lunar:.10,tidal:.10}, lunarSensitivity:.4,
   tip:'Deep wrecks 100-400ft. Always near bottom. Live bait to structure.'},
  {id:'tarp',minOff:0.01,maxOff:0.08, name:'Tarpon',       icon:'🥈', c:'#aabbdd',
   sst:[74,86],chl:[.80,4.00],dep:[0,30],
   w:{sst:.20,chl:.15,dep:.15,lunar:.25,tidal:.25}, lunarSensitivity:1.0, tidalPreference:'outgoing',
   tip:'Silver Kings peak Apr-Jul. Outgoing tides at inlets. Full moon nights legendary.'},
  {id:'flnd',minOff:0.01,maxOff:0.06, name:'Flounder',     icon:'🫓', c:'#ccbb77',
   sst:[58,74],chl:[1.00,4.00],dep:[0,30],
   w:{sst:.30,chl:.20,dep:.25,lunar:.10,tidal:.15}, lunarSensitivity:.4, tidalPreference:'incoming',
   tip:'Sandy inlets 5-60ft. Best Oct-Feb outmigration.'},
  {id:'dolph',minOff:0.35,maxOff:2.5,name:'Dolphin',      icon:'🌊', c:'#44ee99',
   sst:[76,85],chl:[.10,.60],dep:[100,3000],
   w:{sst:.30,chl:.25,dep:.30,lunar:.10,tidal:.05}, lunarSensitivity:.6,
   tip:'Gulf Stream weed lines May-Sep. Troll fast near floating debris.'},
];
export const FISH_MAP = Object.fromEntries(FISH.map(f=>[f.id,f]));

export function scoreSpot(fish, sst, chl, dep, lunarDate=new Date()) {
  let ss=0,cs=0,ds=0;
  if(sst>=fish.sst[0]&&sst<=fish.sst[1]){
    const m=(fish.sst[0]+fish.sst[1])/2,r=(fish.sst[1]-fish.sst[0])/2;
    ss=1-Math.abs(sst-m)/r;
  }
  const cm=(fish.chl[0]+fish.chl[1])/2,cr=(fish.chl[1]-fish.chl[0])/2;
  if(cr>0)cs=Math.max(0,1-Math.abs(chl-cm)/cr);
  if(dep>=fish.dep[0]&&dep<=fish.dep[1]){
    const dm=(fish.dep[0]+fish.dep[1])/2,dr=(fish.dep[1]-fish.dep[0])/2;
    ds=dr>0?Math.max(0,1-Math.abs(dep-dm)/dr):1;
  }
  const lp=lunarPhase(lunarDate);
  const ls=((Math.cos(lp.phase*2*Math.PI)+1)/2)*(fish.lunarSensitivity||0);
  const w=fish.w;
  const total=ss*w.sst+cs*w.chl+ds*w.dep+ls*(w.lunar||0.07);
  return {total:Math.max(0,Math.min(1,isNaN(total)?0:total)),ss,cs,ds,ls};
}

export function computeWaypoints(fish, SG, CG, DG, GG, lunarDate=new Date()) {
  if(!SG||!DG) return [];
  const STEP=0.15;
  const GL0=-82.5,GL1=-76.5,GA0=23.5,GA1=31.8;
  const candidates=[];
  // Coastal boundary lookup (prevents land waypoints)
  function cLon(lat){
    if(lat>=30.7)return -81.38;if(lat>=30.4)return -81.38+(lat-30.7)*0.93;
    if(lat>=30.0)return -81.10+(lat-30.4)*0.70;if(lat>=29.5)return -80.97+(lat-30.0)*0.26;
    if(lat>=29.0)return -80.97;if(lat>=28.5)return -80.75+(lat-29.0)*0.44;
    if(lat>=28.1)return -80.58+(lat-28.5)*0.43;if(lat>=27.8)return -80.58;
    if(lat>=27.0)return -80.28+(lat-27.8)*0.375;if(lat>=26.5)return -80.08+(lat-27.0)*0.40;
    if(lat>=26.0)return -80.07+(lat-26.5)*0.02;if(lat>=25.5)return -80.10+(lat-26.0)*0.06;
    if(lat>=25.1)return -80.35+(lat-25.5)*0.625;if(lat>=24.6)return -80.65+(lat-25.1)*0.60;
    return -81.00+(lat-24.6)*0.70;
  }
  for(let lat=GA0+0.2;lat<GA1-0.2;lat+=STEP) {
    for(let lon=GL0+0.2;lon<GL1-0.2;lon+=STEP) {
      const sst=gvBil(SG,lon,lat);
      if(!sst || sst < 68) continue; // SST=0 means land in our grid
      const offDist = lon - cLon(lat);
      if(offDist < (fish.minOff||0.10)) continue; // too close to shore
      if(offDist > (fish.maxOff||3.0)) continue;  // too far offshore
      const chl=gvBil(CG,lon,lat),gs=gvBil(GG,lon,lat);
      const sc=scoreSpot(fish,sst,chl,lunarDate);
      if(sc.total<0.18)continue;
      candidates.push({lon,lat,dep:Math.round(offDist*60),sst,chl,gs,score:sc});
    }
  }
  candidates.sort((a,b)=>b.score.total-a.score.total);
  const picked=[], letters='ABCDEFGH';
  for(const c of candidates){
    if(picked.length>=8)break;
    if(picked.some(p=>Math.hypot(p.lon-c.lon,p.lat-c.lat)<0.50))continue;
    picked.push({...c,letter:letters[picked.length]});
  }
  return picked.map(w=>({
    letter:w.letter,
    lat:+w.lat.toFixed(3), lon:+w.lon.toFixed(3),
    dep:Math.round(w.dep), sst:+w.sst.toFixed(1), chl:+w.chl.toFixed(2),
    gs:+w.gs.toFixed(2),
    score:{
      total:+w.score.total.toFixed(2), sst:+w.score.ss.toFixed(2),
      chl:+w.score.cs.toFixed(2), dep:+w.score.ds.toFixed(2), lunar:+w.score.ls.toFixed(2),
    },
  }));
}

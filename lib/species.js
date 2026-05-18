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
  {id:'mahi', name:'Mahi-Mahi',    icon:'🐬', c:'#00e5ff',
   sst:[75,84],chl:[.10,.80],dep:[91,600],
   w:{sst:.30,chl:.25,dep:.30,lunar:.10,tidal:.05}, lunarSensitivity:.7,
   tip:'Gulf Stream edge and weed lines 10-30mi offshore. Best May-Sep east of 600ft line.'},
  {id:'sail', name:'Sailfish',     icon:'⚡',  c:'#cc88ff',
   sst:[74,83],chl:[.05,.50],dep:[30,200],
   w:{sst:.35,chl:.20,dep:.30,lunar:.10,tidal:.05}, lunarSensitivity:.8,
   tip:'FL Sailfish Capital. Peak Nov-Apr. Shelf break 100-300ft. Palm Beach to Miami prime.'},
  {id:'wahoo',name:'Wahoo',        icon:'🚀', c:'#ff8822',
   sst:[72,82],chl:[.05,.40],dep:[600,3000],
   w:{sst:.30,chl:.20,dep:.40,lunar:.05,tidal:.05}, lunarSensitivity:.4,
   tip:'Deep offshore 600-3000ft. Current edges key. Burn baits fast fall-spring.'},
  {id:'bft',  name:'Blackfin Tuna',icon:'🐟', c:'#22ddee',
   sst:[72,80],chl:[.20,1.50],dep:[50,400],
   w:{sst:.35,chl:.25,dep:.25,lunar:.10,tidal:.05}, lunarSensitivity:.6,
   tip:'Reef edges and color breaks 80-600ft. Best near SST temp breaks.'},
  {id:'king', name:'Kingfish',     icon:'👑', c:'#ffdd00',
   sst:[68,80],chl:[.50,2.50],dep:[20,120],
   w:{sst:.25,chl:.30,dep:.25,lunar:.10,tidal:.10}, lunarSensitivity:.5, tidalPreference:'incoming',
   tip:'Nearshore reefs 30-200ft. High chl = bait = kings. Spring and fall peak.'},
  {id:'cobia',name:'Cobia',        icon:'🦈', c:'#88dd00',
   sst:[68,78],chl:[.80,3.50],dep:[0,80],
   w:{sst:.25,chl:.20,dep:.20,lunar:.15,tidal:.20}, lunarSensitivity:.7, tidalPreference:'incoming',
   tip:'Follow rays near nearshore markers. Spring migration Mar-May.'},
  {id:'snap', name:'Snapper',      icon:'🔴', c:'#ff7777',
   sst:[65,82],chl:[.40,2.50],dep:[40,300],
   w:{sst:.20,chl:.20,dep:.30,lunar:.20,tidal:.10}, lunarSensitivity:.9, tidalPreference:'outgoing',
   tip:'Reefs and wrecks 60-600ft. Night fishing. New/full moon critical.'},
  {id:'grp',  name:'Grouper',      icon:'🟫', c:'#dd9933',
   sst:[62,78],chl:[.50,3.00],dep:[40,200],
   w:{sst:.25,chl:.20,dep:.35,lunar:.15,tidal:.05}, lunarSensitivity:.6,
   tip:'Deep ledges and wrecks 60-300ft. Cooler months push fish shallower.'},
  {id:'aj',   name:'Amberjack',    icon:'⚓', c:'#ffaa44',
   sst:[68,82],chl:[.40,2.00],dep:[60,250],
   w:{sst:.25,chl:.15,dep:.40,lunar:.10,tidal:.10}, lunarSensitivity:.4,
   tip:'Deep wrecks 100-400ft. Always near bottom. Live bait to structure.'},
  {id:'tarp', name:'Tarpon',       icon:'🥈', c:'#aabbdd',
   sst:[74,86],chl:[.80,4.00],dep:[0,30],
   w:{sst:.20,chl:.15,dep:.15,lunar:.25,tidal:.25}, lunarSensitivity:1.0, tidalPreference:'outgoing',
   tip:'Silver Kings peak Apr-Jul. Outgoing tides at inlets. Full moon nights legendary.'},
  {id:'flnd', name:'Flounder',     icon:'🫓', c:'#ccbb77',
   sst:[58,74],chl:[1.00,4.00],dep:[0,30],
   w:{sst:.30,chl:.20,dep:.25,lunar:.10,tidal:.15}, lunarSensitivity:.4, tidalPreference:'incoming',
   tip:'Sandy inlets 5-60ft. Best Oct-Feb outmigration.'},
  {id:'dolph',name:'Dolphin',      icon:'🌊', c:'#44ee99',
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
  function cLon(lat) {
    // Accurate FL east coast - proper linear interpolation
    const pts=[
      [31.0,-81.47],[30.7,-81.38],[30.4,-81.38],
      [30.0,-81.28],[29.5,-81.13],[29.0,-80.97],
      [28.5,-80.75],[28.0,-80.60],[27.5,-80.44],
      [27.0,-80.22],[26.5,-80.07],[26.0,-80.07],
      [25.5,-80.12],[25.0,-80.35]
    ];
    if(lat>=pts[0][0]) return pts[0][1]; // north of range
    for(let i=0;i<pts.length-1;i++){
      const [lh,lonh]=pts[i],[ll,lonl]=pts[i+1];
      if(lat>=ll){
        const t=(lat-ll)/(lh-ll);
        return lonl+t*(lonh-lonl);
      }
    }
    return pts[pts.length-1][1];
  }
  for(let lat=GA0+0.2;lat<Math.min(GA1-0.2,31.4);lat+=STEP) {
    for(let lon=GL0+0.2;lon<GL1-0.2;lon+=STEP) {
      if(lon <= cLon(lat)+0.30) continue; // must be >18mi offshore minimum
      const dep=gvBil(DG,lon,lat); if(dep<25)continue; // hard minimum 25ft // strict min depth
      const sst=gvBil(SG,lon,lat),chl=gvBil(CG,lon,lat),gs=gvBil(GG,lon,lat);
      if(!sst)continue;
      const sc=scoreSpot(fish,sst,chl,dep,lunarDate);
      if(sc.total<0.18)continue;
      candidates.push({lon,lat,dep,sst,chl,gs,score:sc});
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

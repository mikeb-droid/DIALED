// ============================================================
// lib/ocean.js  —  grid interpolation, isotherms, depth
// ============================================================

export const NX = 200, NY = 180;
export const GL0 = -82.5, GL1 = -76.5, GA0 = 23.5, GA1 = 31.8;

// ── Depth model ───────────────────────────────────────────────────────
export function coastLon(lat) {
  if(lat>=30.7)return -81.38; if(lat>=30.4)return -81.38+(lat-30.7)*0.93;
  if(lat>=30.0)return -81.10+(lat-30.4)*0.70; if(lat>=29.5)return -80.97+(lat-30.0)*0.26;
  if(lat>=29.0)return -80.97; if(lat>=28.5)return -80.75+(lat-29.0)*0.44;
  if(lat>=28.1)return -80.58+(lat-28.5)*0.43; if(lat>=27.8)return -80.58;
  if(lat>=27.0)return -80.28+(lat-27.8)*0.375; if(lat>=26.5)return -80.08+(lat-27.0)*0.40;
  if(lat>=26.0)return -80.07+(lat-26.5)*0.02; if(lat>=25.5)return -80.10+(lat-26.0)*0.06;
  if(lat>=25.1)return -80.35+(lat-25.5)*0.625; if(lat>=24.6)return -80.65+(lat-25.1)*0.60;
  return -81.00+(lat-24.6)*0.70;
}
export function shelfBreak(lat) {
  if(lat>=30.5)return 1.25; if(lat>=30.0)return 1.10; if(lat>=29.5)return 0.90;
  if(lat>=29.0)return 0.76; if(lat>=28.5)return 0.62; if(lat>=28.0)return 0.53;
  if(lat>=27.5)return 0.42; if(lat>=27.0)return 0.30; if(lat>=26.5)return 0.22;
  if(lat>=26.0)return 0.18; if(lat>=25.5)return 0.20; return 0.25;
}
export function aDep(lon, lat) {
  const off = Math.max(0, lon - coastLon(lat));
  if(off<0.001)return 0;
  const sb=shelfBreak(lat), p=off/sb;
  if(p<0.05) return p/0.05*25;
  if(p<0.25) return 25 +(p-0.05)/0.20*55;
  if(p<0.60) return 80 +(p-0.25)/0.35*70;
  if(p<0.95) return 150+(p-0.60)/0.35*50;
  if(p<1.10) return 200+(p-0.95)/0.15*400;
  if(p<1.60) return 600+(p-1.10)/0.50*600;
  if(p<2.50) return 1200+(p-1.60)/0.90*1800;
  if(p<4.00) return 3000+(p-2.50)/1.50*2000;
  return 5000;
}

// ── Build the static depth grid ───────────────────────────────────────
export function buildDepthGrid() {
  const DG = new Float32Array(NX * NY);
  const GG = new Float32Array(NX * NY); // gulf stream proximity
  for(let iy=0;iy<NY;iy++) for(let ix=0;ix<NX;ix++) {
    const lon=GL0+ix/NX*(GL1-GL0), lat=GA1-iy/NY*(GA1-GA0);
    DG[iy*NX+ix] = aDep(lon, lat);
    const gsC = coastLon(lat)+1.15+Math.sin(lat*0.48)*0.32;
    GG[iy*NX+ix] = Math.exp(-(lon-gsC)*(lon-gsC)*3.2);
  }
  return { DG, GG };
}

// ── IDW interpolation from sparse real data points → NX×NY grid ──────
export function interpolateToGrid(points, DG, field) {
  if(!points || points.length === 0) return null;
  const grid = new Float32Array(NX * NY);
  for(let iy=0;iy<NY;iy++) for(let ix=0;ix<NX;ix++) {
    if(DG[iy*NX+ix] <= 0) continue;
    const lon=GL0+ix/NX*(GL1-GL0), lat=GA1-iy/NY*(GA1-GA0);
    const nearest = points
      .map(p => ({ v:p[field], d2:(p.lon-lon)**2+(p.lat-lat)**2 }))
      .sort((a,b)=>a.d2-b.d2).slice(0,6);
    let wSum=0, vSum=0;
    for(const {v,d2} of nearest) {
      const w = d2<1e-8 ? 1e8 : 1/d2;
      wSum+=w; vSum+=w*v;
    }
    let val = wSum>0 ? vSum/wSum : 0;
    if(field==='sst') val=Math.max(67,Math.min(91,val));
    if(field==='chl') val=Math.max(0.01,Math.min(8,val));
    grid[iy*NX+ix] = Math.round(val*100)/100;
  }
  return grid;
}

// ── Bilinear grid lookup ──────────────────────────────────────────────
export function gvBil(G, lon, lat) {
  if(!G) return 0;
  const fx=(lon-GL0)/(GL1-GL0)*NX, fy=(GA1-lat)/(GA1-GA0)*NY;
  const ix=Math.max(0,Math.min(NX-2,Math.floor(fx)));
  const iy=Math.max(0,Math.min(NY-2,Math.floor(fy)));
  const tx=fx-ix, ty=fy-iy;
  const v00=G[iy*NX+ix], v10=G[iy*NX+(ix+1)];
  const v01=G[(iy+1)*NX+ix], v11=G[(iy+1)*NX+(ix+1)];
  if(!v00||!v10||!v01||!v11) return G[iy*NX+ix]||0;
  return v00*(1-tx)*(1-ty)+v10*tx*(1-ty)+v01*(1-tx)*ty+v11*tx*ty;
}

// ── Marching squares isotherms → geo-space line segments ─────────────
export function computeIsotherms(SG) {
  if(!SG) return [];
  const cW=(GL1-GL0)/NX, cH=(GA1-GA0)/NY;
  const result=[];
  for(let T=68;T<=87;T++) {
    const major=T%2===0;
    const segs=[], labels=[];
    for(let iy=0;iy<NY-1;iy++) for(let ix=0;ix<NX-1;ix++) {
      const s00=SG[iy*NX+ix], s10=SG[iy*NX+(ix+1)];
      const s01=SG[(iy+1)*NX+ix], s11=SG[(iy+1)*NX+(ix+1)];
      if(!s00||!s10||!s01||!s11) continue;
      const v00=s00>T?1:0,v10=s10>T?1:0,v01=s01>T?1:0,v11=s11>T?1:0;
      const code=v00|(v10<<1)|(v01<<2)|(v11<<3);
      if(code===0||code===15) continue;
      const lon=GL0+ix*cW, lat=GA1-iy*cH, lx=cW, ly=cH;
      const lp=(a,b,va,vb)=>Math.abs(vb-va)<0.001?0.5:(T-va)/(vb-va)*(b-a)+a;
      const eT=[lp(lon,lon+lx,s00,s10),lat], eB=[lp(lon,lon+lx,s01,s11),lat-ly];
      const eL=[lon,lp(lat,lat-ly,s00,s01)], eR=[lon+lx,lp(lat,lat-ly,s10,s11)];
      const add=(a,b)=>{segs.push(a[0],a[1],b[0],b[1]);if(major)labels.push((a[0]+b[0])/2,(a[1]+b[1])/2);};
      switch(code){
        case 1:case 14:add(eT,eL);break; case 2:case 13:add(eT,eR);break;
        case 3:case 12:add(eL,eR);break; case 4:case 11:add(eB,eL);break;
        case 6:case 9:add(eT,eB);break;  case 7:case 8:add(eB,eR);break;
        case 5:add(eT,eL);add(eB,eR);break; case 10:add(eT,eR);add(eB,eL);break;
      }
    }
    result.push({T,major,segs,labels});
  }
  return result;
}

// ── Temperature break detection ───────────────────────────────────────
export function computeTempBreaks(SG, DG) {
  if(!SG) return [];
  const THRESH=0.65, breaks=[];
  for(let iy=1;iy<NY-1;iy++) for(let ix=1;ix<NX-1;ix++) {
    const s=SG[iy*NX+ix]; if(!s) continue;
    const sr=SG[iy*NX+(ix+1)],sl=SG[iy*NX+(ix-1)];
    const su=SG[(iy-1)*NX+ix],sd=SG[(iy+1)*NX+ix];
    if(!sr||!sl||!su||!sd) continue;
    const mag=Math.sqrt(((sr-sl)/2)**2+((su-sd)/2)**2);
    if(mag<THRESH||DG[iy*NX+ix]<=0) continue;
    breaks.push({
      lon:+( GL0+(ix/NX)*(GL1-GL0) ).toFixed(3),
      lat:+( GA1-(iy/NY)*(GA1-GA0) ).toFixed(3),
      intensity:+(Math.min(1,(mag-THRESH)/2.0)).toFixed(2),
    });
  }
  return breaks;
}

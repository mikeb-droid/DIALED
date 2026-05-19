const ERDDAP='https://coastwatch.pfeg.noaa.gov/erddap/griddap';
const LAT_MIN=24.0,LAT_MAX=31.5,LON_MIN=-82.5,LON_MAX=-76.5;
function getSSTDate(req){const d=req?new Date(req):new Date();d.setDate(d.getDate()-3);return d.toISOString().slice(0,10)+'T09:00:00Z';}
function getChlDate(req){const d=req?new Date(req):new Date();d.setDate(d.getDate()-7);d.setDate(d.getDate()-d.getDay());return d.toISOString().slice(0,10)+'T12:00:00Z';}
function erddapUrl(ds,v,t,s){return ERDDAP+'/'+ds+'.json?'+v+'[('+t+'):1:('+t+')][('+LAT_MIN+'):'+s+':('+LAT_MAX+')][('+LON_MIN+'):'+s+':('+LON_MAX+')]';}
async function fetchSST(reqDate){
  const time=getSSTDate(reqDate);
  console.log('Fetching SST:',time.slice(0,10));
  const resp=await fetch(erddapUrl('jplMURSST41','analysed_sst',time,4),{headers:{'User-Agent':'DIALED/1.0'},signal:AbortSignal.timeout(45000)});
  if(!resp.ok)throw new Error('SST '+resp.status);
  const data=await resp.json();
  const points=data.table.rows.filter(r=>r[3]!==null&&r[3]>-10).map(([,lat,lon,sst])=>({lat:+lat.toFixed(3),lon:+lon.toFixed(3),sst:+(sst*9/5+32).toFixed(1)}));
  console.log('SST:',points.length,'points');
  return{points,date:time.slice(0,10)};
}
async function fetchChlorophyll(reqDate){
  // Try multiple chlorophyll datasets in order of preference
  const datasets=[
    // NOAA VIIRS NRT daily global 4km - active through 2026
    {id:'noaacwNPPVIIRSchlaDaily', server:'https://coastwatch.noaa.gov/erddap/griddap', variable:'chlor_a', stride:4},
    // NOAA VIIRS science quality weekly
    {id:'nesdisVHNSQchlaWeekly', server:'https://coastwatch.pfeg.noaa.gov/erddap/griddap', variable:'chlor_a', stride:4},
    // USF IMaRS MODIS-Aqua FL daily
    {id:'moda_oc_1d_fl', server:'https://erddap.marine.usf.edu/erddap/griddap', variable:'chlor_a', stride:2},
  ];
  
  for(const ds of datasets){
    try{
      const d=reqDate?new Date(reqDate):new Date();
      d.setDate(d.getDate()-2);
      const time=d.toISOString().slice(0,10)+'T12:00:00Z';
      console.log('Trying Chl dataset:',ds.id,'time:',time.slice(0,10));
      const url=ds.server+'/'+ds.id+'.json?'+ds.variable+'[('+time+'):1:('+time+')][('+LAT_MIN+'):'+ds.stride+':('+LAT_MAX+')][('+LON_MIN+'):'+ds.stride+':('+LON_MAX+')]';
      const resp=await fetch(url,{headers:{'User-Agent':'DIALED/1.0'},signal:AbortSignal.timeout(30000)});
      if(!resp.ok){console.log('Chl',ds.id,'returned',resp.status);continue;}
      const data=await resp.json();
      const points=data.table.rows.filter(r=>r[3]!==null&&r[3]>0&&r[3]<100).map(([,lat,lon,chl])=>({lat:+lat.toFixed(3),lon:+lon.toFixed(3),chl:+chl.toFixed(3)}));
      if(points.length<10){console.log('Chl',ds.id,'too few points:',points.length);continue;}
      console.log('Chl success:',ds.id,points.length,'points');
      return{points,date:time.slice(0,10),source:ds.id};
    }catch(e){
      console.log('Chl',ds.id,'failed:',e.message);
    }
  }
  throw new Error('All chlorophyll sources failed');
}
const FL_BUOYS=[
  {id:'41009',name:'Canaveral 20NM',lat:28.508,lon:-80.185},
  {id:'41010',name:'Canaveral 120NM',lat:28.878,lon:-78.485},
  {id:'41044',name:'W Central N Atl',lat:28.573,lon:-77.564},
  {id:'41047',name:'NE Bahamas',lat:27.514,lon:-71.494},
  {id:'41004',name:'EDISTO',lat:32.501,lon:-79.099},
];
function windDirLabel(deg){if(deg===null||deg===undefined)return null;const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return dirs[Math.round(deg/22.5)%16];}
function parseBuoyText(id,text){
  const lines=text.trim().split('\n');if(lines.length<3)return null;
  const headers=lines[0].replace(/^#\s*/,'').trim().split(/\s+/);
  const recent=lines[2].trim().split(/\s+/);
  const get=name=>{const i=headers.indexOf(name);if(i<0||i>=recent.length)return null;const v=parseFloat(recent[i]);return isNaN(v)||recent[i]==='MM'?null:v;};
  const buoyMeta=FL_BUOYS.find(b=>b.id===id)||{lat:0,lon:0,name:id};
  const yr=recent[0],mo=recent[1],dy=recent[2],hr=recent[3],mn=recent[4];
  return{id,name:buoyMeta.name,lat:buoyMeta.lat,lon:buoyMeta.lon,timestamp:yr+'-'+mo+'-'+dy+'T'+hr+':'+mn+':00Z',
    wind:{dir:get('WDIR'),speed:get('WSPD')!==null?+(get('WSPD')*1.944).toFixed(1):null,gust:get('GST')!==null?+(get('GST')*1.944).toFixed(1):null,dirLabel:windDirLabel(get('WDIR'))},
    waves:{height:get('WVHT')!==null?+(get('WVHT')*3.281).toFixed(1):null,period:get('DPD'),dirLabel:windDirLabel(get('MWD'))},
    sst:get('WTMP')!==null?+(get('WTMP')*9/5+32).toFixed(1):null,airTemp:get('ATMP')!==null?+(get('ATMP')*9/5+32).toFixed(1):null,pressure:get('PRES')};
}
async function fetchBuoy(buoyId){
  try{const resp=await fetch('https://www.ndbc.noaa.gov/data/realtime2/'+buoyId+'.txt',{signal:AbortSignal.timeout(10000)});if(!resp.ok)return null;return parseBuoyText(buoyId,await resp.text());}
  catch(e){return null;}
}
async function fetchAllBuoys(){
  const results=await Promise.allSettled(FL_BUOYS.map(b=>fetchBuoy(b.id)));
  return results.filter(r=>r.status==='fulfilled'&&r.value!==null).map(r=>r.value);
}
const MARINE_ZONES=[
  {id:'AMZ570',name:'Flagler to Brevard 20-60nm'},
  {id:'AMZ555',name:'Sebastian to Jupiter 0-20nm'},
  {id:'AMZ552',name:'Brevard to Sebastian 0-20nm'},
];
async function fetchMarineForecast(zoneId){
  try{
    const officeMap={'AMZ570':'MLB','AMZ552':'MLB','AMZ555':'MLB','AMZ532':'JAX','AMZ535':'JAX'};
    const office=officeMap[zoneId]||'MLB';
    const listUrl='https://api.weather.gov/products/types/CWF/locations/'+office;
    const listResp=await fetch(listUrl,{headers:{'User-Agent':'DIALED/1.0','Accept':'application/json'},signal:AbortSignal.timeout(10000)});
    if(!listResp.ok) throw new Error('List '+listResp.status);
    const listData=await listResp.json();
    const latestId=(listData['@graph']&&listData['@graph'][0]&&listData['@graph'][0]['@id'])||null;
    if(!latestId) throw new Error('No products found');
    const prodResp=await fetch(latestId,{headers:{'User-Agent':'DIALED/1.0','Accept':'application/json'},signal:AbortSignal.timeout(10000)});
    if(!prodResp.ok) throw new Error('Product '+prodResp.status);
    const prodData=await prodResp.json();
    const text=prodData.productText||'';
    const zoneSection=text.split(zoneId)[1]||text;
    const periods=[];
    let currentPeriod=null;
    for(const line of zoneSection.split(String.fromCharCode(10))){
      const trimmed=line.trim();
      const hdr=trimmed.match(/^\.([A-Z][A-Z ]+?)\.\.\.(.*)/);
      if(hdr){
        if(currentPeriod)periods.push(currentPeriod);
        currentPeriod={name:hdr[1].trim(),text:hdr[2].trim(),parsed:{}};
      } else if(currentPeriod&&trimmed&&!trimmed.startsWith('$$')&&!trimmed.match(/^[A-Z]{3}[0-9]/)){
        currentPeriod.text+=' '+trimmed;
      }
      if(trimmed.startsWith('$$'))break;
    }
    if(currentPeriod)periods.push(currentPeriod);
    periods.forEach(p=>{p.parsed=parseMarineForecast(p.text);});
    console.log('Marine forecast OK:',zoneId,periods.length,'periods');
    return{zone:zoneId,updated:new Date().toISOString(),periods:periods.slice(0,8)};
  }catch(e){
    console.log('Marine forecast failed for',zoneId,':',e.message);
    return null;
  }
}
function parseMarineForecast(text){
  if(!text)return{};
  const t=text.toLowerCase();
  const wm=t.match(/winds?\s+(?:\w+\s+)?(\d+)\s+to\s+(\d+)\s*k[tn]/);
  const wa=t.match(/winds?\s+(?:\w+\s+)?around\s+(\d+)\s*k[tn]/);
  const sm=t.match(/seas?\s+(\d+)\s+to\s+(\d+)\s*f[te]/);
  const sa=t.match(/seas?\s+around\s+(\d+)\s*f[te]/);
  return{windMin:wm?+wm[1]:wa?+wa[1]:null,windMax:wm?+wm[2]:wa?+wa[1]:null,seasMin:sm?+sm[1]:sa?+sa[1]:null,seasMax:sm?+sm[2]:sa?+sa[1]:null,hasThunder:t.includes('thunder'),hasSquall:t.includes('squall'),hasFog:t.includes('fog'),hasGale:t.includes('gale')};
}
function getGoStatus(buoys,forecasts,boat){
  boat=boat||'medium';
  const limits={small:{wind:15,seas:2},medium:{wind:20,seas:4},large:{wind:25,seas:6}}[boat]||{wind:20,seas:4};
  const issues=[];let worstLevel='GO';
  for(const b of buoys){
    if(b.wind&&b.wind.speed>=limits.wind*1.3){issues.push(b.name+': winds '+b.wind.speed+'kt');worstLevel='NO-GO';}
    else if(b.wind&&b.wind.speed>=limits.wind){issues.push(b.name+': winds '+b.wind.speed+'kt');if(worstLevel!=='NO-GO')worstLevel='CAUTION';}
    if(b.waves&&b.waves.height>=limits.seas*1.5){issues.push(b.name+': seas '+b.waves.height+'ft');worstLevel='NO-GO';}
    else if(b.waves&&b.waves.height>=limits.seas){issues.push(b.name+': seas '+b.waves.height+'ft');if(worstLevel!=='NO-GO')worstLevel='CAUTION';}
  }
  for(const f of forecasts){for(const p of(f&&f.periods||[])){const pd=p.parsed||{};
    if(pd.hasGale||pd.hasSquall){issues.push(f.zone+': '+(pd.hasGale?'GALE WARNING':'squalls'));worstLevel='NO-GO';}
    else if(pd.hasThunder){issues.push(f.zone+': thunderstorms');if(worstLevel!=='NO-GO')worstLevel='CAUTION';}
    if(pd.windMax&&pd.windMax>=limits.wind){issues.push('Forecast: winds to '+pd.windMax+'kt');if(worstLevel!=='NO-GO')worstLevel='CAUTION';}
    if(pd.seasMax&&pd.seasMax>=limits.seas){issues.push('Forecast: seas to '+pd.seasMax+'ft');if(worstLevel!=='NO-GO')worstLevel='CAUTION';}
  }}
  return{status:worstLevel,issues:[...new Set(issues)],limits};
}
module.exports={getSSTDate,getChlDate,fetchSST,fetchChlorophyll,fetchBuoy,fetchAllBuoys,FL_BUOYS,MARINE_ZONES,fetchMarineForecast,getGoStatus};
// v1779203083

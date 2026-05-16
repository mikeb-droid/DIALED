const{fetchAllBuoys,fetchMarineForecast,getGoStatus}=require('../lib/noaa.js');
module.exports=async function handler(req,res){
  const boat=(req.query&&req.query.boat)||'medium';
  const lat=req.query&&req.query.lat;
  const lon=req.query&&req.query.lon;
  try{
    let buoys=[];
    try{buoys=await fetchAllBuoys();}catch(e){console.warn('Buoy fetch failed:',e.message);}
    const zoneIds=lat?selectZones(parseFloat(lat)):['AMZ632','AMZ652','AMZ672'];
    const forecasts=await Promise.allSettled(zoneIds.map(z=>fetchMarineForecast(z))).then(r=>r.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value));
    const status=getGoStatus(buoys,forecasts,boat);
    const formattedBuoys=buoys.map(b=>({id:b.id,name:b.name,lat:b.lat,lon:b.lon,timestamp:b.timestamp,wind:b.wind,waves:b.waves,sst:b.sst,airTemp:b.airTemp,distance:lat&&lon?+(Math.hypot(b.lat-parseFloat(lat),b.lon-parseFloat(lon))*60).toFixed(0):null})).sort((a,b)=>(a.distance||999)-(b.distance||999));
    res.setHeader('Cache-Control','s-maxage=1800,stale-while-revalidate=3600');
    return res.status(200).json({status:status.status,issues:status.issues,limits:status.limits,buoys:formattedBuoys,forecasts:forecasts.map(f=>({zone:f.zone,updated:f.updated,periods:f.periods.slice(0,3)})),fetchedAt:new Date().toISOString()});
  }catch(err){return res.status(500).json({error:err.message});}
}
function selectZones(lat){
  if(lat>=30.0)return['AMZ630','AMZ632'];if(lat>=28.5)return['AMZ632','AMZ650'];
  if(lat>=27.0)return['AMZ650','AMZ652'];if(lat>=26.0)return['AMZ652','AMZ670'];
  return['AMZ670','AMZ672'];
}

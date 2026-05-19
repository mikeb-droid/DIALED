const{fetchAllBuoys,fetchMarineForecast,getGoStatus}=require('../lib/noaa.js');
module.exports=async function handler(req,res){
  const boat=(req.query&&req.query.boat)||'medium';
  const lat=req.query&&req.query.lat;
  const lon=req.query&&req.query.lon;
  const day=parseInt(req.query&&req.query.day)||0;
  try{
    let buoys=[];
    // For forecast days, skip live buoy fetch (use cached or empty)
    if(day===0){
      try{buoys=await fetchAllBuoys();}catch(e){console.warn('Buoy fetch failed:',e.message);}
    }
    const zoneIds=lat?selectZones(parseFloat(lat)):['AMZ570','AMZ555','AMZ552'];
    const forecasts=await Promise.allSettled(zoneIds.map(z=>fetchMarineForecast(z))).then(r=>r.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value));
    
    // For forecast days, use the appropriate forecast period
    let forecastsForDay=forecasts;
    if(day>0){
      // Use period index based on day offset (each period is ~12hrs)
      const periodIdx=day*2-1;
      forecastsForDay=forecasts.map(f=>({
        ...f,
        periods:f.periods?[f.periods[Math.min(periodIdx,f.periods.length-1)]].filter(Boolean):[]
      }));
    }
    
    const status=getGoStatus(day===0?buoys:[], forecastsForDay, boat);
    const formattedBuoys=day===0?buoys.map(b=>({id:b.id,name:b.name,lat:b.lat,lon:b.lon,timestamp:b.timestamp,wind:b.wind,waves:b.waves,sst:b.sst,airTemp:b.airTemp,distance:lat&&lon?+(Math.hypot(b.lat-parseFloat(lat),b.lon-parseFloat(lon))*60).toFixed(0):null})).sort((a,b)=>(a.distance||999)-(b.distance||999)):[];
    
    res.setHeader('Cache-Control','s-maxage=0,must-revalidate');
    return res.status(200).json({
      status:status.status,issues:status.issues,limits:status.limits,
      buoys:formattedBuoys,
      forecasts:forecastsForDay.map(f=>({zone:f.zone,updated:f.updated,periods:(f.periods||[]).slice(0,3)})),
      forecastDay:day,
      fetchedAt:new Date().toISOString(),
    });
  }catch(err){return res.status(500).json({error:err.message});}
}
function selectZones(lat){
  if(lat>=30.0)return['AMZ570','AMZ532'];
  if(lat>=28.0)return['AMZ570','AMZ555'];
  if(lat>=27.0)return['AMZ555','AMZ552'];
  return['AMZ552','AMZ555'];
}

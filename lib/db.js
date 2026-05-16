const{createClient}=require('@supabase/supabase-js');
let _client=null;
function getDB(){
  if(!_client){
    const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_KEY;
    if(!url||!key)throw new Error('Missing env vars');
    _client=createClient(url,key);
  }
  return _client;
}
async function saveOceanData(date,data){
  const db=getDB();
  const{error}=await db.from('ocean_data').upsert({date,
    sst_grid:data.sstGrid?Array.from(data.sstGrid):null,
    chl_grid:data.chlGrid?Array.from(data.chlGrid):null,
    depth_grid:data.depthGrid?Array.from(data.depthGrid):null,
    gs_grid:data.gsGrid?Array.from(data.gsGrid):null,
    isotherms:data.isotherms||null,temp_breaks:data.tempBreaks||null,
    waypoints:data.waypoints||null,sst_date:data.sstDate||null,
    chl_date:data.chlDate||null,updated_at:new Date().toISOString(),
  },{onConflict:'date'});
  if(error)throw error;
  return true;
}
async function getLatestOceanData(){
  const db=getDB();
  const{data,error}=await db.from('ocean_data').select('*').order('date',{ascending:false}).limit(1).single();
  if(error)throw error;
  return data;
}
async function getOceanDataByDate(date){
  const db=getDB();
  const{data,error}=await db.from('ocean_data').select('*').eq('date',date).single();
  if(error)return null;
  return data;
}
async function saveBuoyData(buoys){
  const db=getDB();
  const rows=buoys.map(b=>({
    buoy_id:b.id,name:b.name,lat:b.lat,lon:b.lon,timestamp:b.timestamp,
    wind_speed:b.wind&&b.wind.speed,wind_dir:b.wind&&b.wind.dir,
    wind_gust:b.wind&&b.wind.gust,wave_height:b.waves&&b.waves.height,
    wave_period:b.waves&&b.waves.period,sst:b.sst,air_temp:b.airTemp,
    pressure:b.pressure,fetched_at:new Date().toISOString()}));
  const{error}=await db.from('buoy_data').upsert(rows,{onConflict:'buoy_id,timestamp'});
  if(error)console.warn('Buoy error:',error.message);
}
async function getLatestBuoys(){
  const db=getDB();
  const{data,error}=await db.from('buoy_data').select('*').order('fetched_at',{ascending:false}).limit(20);
  if(error)throw error;
  const seen=new Set();
  return(data||[]).filter(b=>{
    if(seen.has(b.buoy_id))return false;
    seen.add(b.buoy_id);return true;});
}
module.exports={getDB,saveOceanData,getLatestOceanData,getOceanDataByDate,saveBuoyData,getLatestBuoys};

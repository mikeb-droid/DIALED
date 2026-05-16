const { fetchSST, fetchChlorophyll, fetchAllBuoys } = require('../lib/noaa.js');
const { buildDepthGrid, interpolateToGrid, computeIsotherms, computeTempBreaks, NX, NY } = require('../lib/ocean.js');
const { FISH, computeWaypoints } = require('../lib/species.js');
const { saveOceanData, saveBuoyData } = require('../lib/db.js');

module.exports = async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const secret = process.env.CRON_SECRET;
  const isVercelCron = authHeader === `Bearer ${secret}`;
  const isManual = req.query?.secret === secret;
  if (!isVercelCron && !isManual) return res.status(401).json({ error: 'Unauthorized' });

  const start = Date.now();
  try {
    const { DG, GG } = buildDepthGrid();

    let sstResult = null, sstGrid = null;
    try {
      sstResult = await fetchSST();
      sstGrid = interpolateToGrid(sstResult.points, DG, 'sst');
    } catch(e) {
      console.log('SST fetch failed:', e.message);
      sstGrid = new Float32Array(NX*NY).fill(78);
    }

    let chlResult = null, chlGrid = null;
    try {
      chlResult = await fetchChlorophyll();
      chlGrid = interpolateToGrid(chlResult.points, DG, 'chl');
    } catch(e) {
      console.log('Chl fetch failed:', e.message);
      chlGrid = new Float32Array(NX*NY).fill(0.5);
    }

    const isotherms  = computeIsotherms(sstGrid);
    const tempBreaks = computeTempBreaks(sstGrid, DG);

    const waypoints = {};
    for (const fish of FISH) {
      waypoints[fish.id] = computeWaypoints(fish, sstGrid, chlGrid, DG, GG);
    }

    const today = new Date().toISOString().slice(0,10);
    await saveOceanData(today, {
      sstGrid, chlGrid, depthGrid: DG, gsGrid: GG,
      isotherms, tempBreaks, waypoints,
      sstDate: sstResult?.date || null,
      chlDate: chlResult?.date || null,
    });

    try {
      const buoys = await fetchAllBuoys();
      await saveBuoyData(buoys);
    } catch(e) { console.log('Buoy save failed:', e.message); }

    const elapsed = ((Date.now()-start)/1000).toFixed(1);
    return res.status(200).json({ success: true, elapsed: elapsed+'s', date: today,
      isotherms: isotherms.length, tempBreaks: tempBreaks.length,
      waypoints: Object.fromEntries(Object.entries(waypoints).map(([k,v])=>[k,v.length])) });
  } catch(err) {
    console.error('Pipeline failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

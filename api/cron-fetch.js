// ============================================================
// api/cron-fetch.js  —  Daily NOAA data pipeline
// Runs at 7:00 AM UTC via Vercel cron (vercel.json)
// Also callable manually: GET /api/cron-fetch?secret=YOUR_SECRET
// ============================================================

import { fetchSST, fetchChlorophyll, fetchAllBuoys,
         fetchMarineForecast, MARINE_ZONES } from '../lib/noaa.js';
import { buildDepthGrid, interpolateToGrid,
         computeIsotherms, computeTempBreaks, NX, NY } from '../lib/ocean.js';
import { FISH, computeWaypoints } from '../lib/species.js';
import { saveOceanData, saveBuoyData } from '../lib/db.js';

export default async function handler(req, res) {
  // Security check — only allow Vercel cron or requests with the secret
  const authHeader = req.headers['authorization'];
  const secret = process.env.CRON_SECRET;
  const querySecret = req.query?.secret;

  const isVercelCron = authHeader === `Bearer ${secret}`;
  const isManual     = querySecret === secret;

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log = [];
  const start = Date.now();

  try {
    log.push('=== DIALED Data Pipeline ===');
    log.push(`Started: ${new Date().toISOString()}`);

    // ── 1. Build static depth grid ────────────────────────────────────
    log.push('\n[1/5] Building depth grid...');
    const { DG, GG } = buildDepthGrid();
    log.push(`      Depth grid: ${NX}x${NY} = ${NX*NY} cells`);

    // ── 2. Fetch real SST from NASA MUR ───────────────────────────────
    log.push('\n[2/5] Fetching NASA MUR SST...');
    let sstResult = null, sstGrid = null;
    try {
      sstResult = await fetchSST();
      sstGrid = interpolateToGrid(sstResult.points, DG, 'sst');
      const validCells = sstGrid.filter(v=>v>0).length;
      log.push(`      SST: ${sstResult.points.length} sat points → ${validCells} grid cells`);
      log.push(`      Date: ${sstResult.date} | Source: ${sstResult.source}`);
    } catch(e) {
      log.push(`      WARNING: SST fetch failed (${e.message}) — using model fallback`);
      sstGrid = buildModelSST(DG, GG);
    }

    // ── 3. Fetch chlorophyll from NOAA VIIRS ──────────────────────────
    log.push('\n[3/5] Fetching NOAA VIIRS Chlorophyll...');
    let chlResult = null, chlGrid = null;
    try {
      chlResult = await fetchChlorophyll();
      chlGrid = interpolateToGrid(chlResult.points, DG, 'chl');
      const validCells = chlGrid.filter(v=>v>0).length;
      log.push(`      Chl: ${chlResult.points.length} sat points → ${validCells} grid cells`);
      log.push(`      Date: ${chlResult.date} | Source: ${chlResult.source}`);
    } catch(e) {
      log.push(`      WARNING: Chlorophyll fetch failed (${e.message}) — using model fallback`);
      chlGrid = buildModelChl(DG, GG);
    }

    // ── 4. Compute derived products ───────────────────────────────────
    log.push('\n[4/5] Computing derived products...');
    const isotherms  = computeIsotherms(sstGrid);
    const tempBreaks = computeTempBreaks(sstGrid, DG);
    log.push(`      Isotherms: ${isotherms.length} temperature lines`);
    log.push(`      Temp breaks: ${tempBreaks.length} gradient points`);

    // Compute waypoints for all species
    const waypoints = {};
    for(const fish of FISH) {
      const pts = computeWaypoints(fish, sstGrid, chlGrid, DG, GG);
      waypoints[fish.id] = pts;
      log.push(`      ${fish.icon} ${fish.name}: ${pts.length} spots`);
    }

    // ── 5. Save to Supabase ───────────────────────────────────────────
    log.push('\n[5/5] Saving to database...');
    const today = new Date().toISOString().slice(0,10);
    await saveOceanData(today, {
      sstGrid, chlGrid, depthGrid: DG, gsGrid: GG,
      isotherms, tempBreaks, waypoints,
      sstDate: sstResult?.date || null,
      chlDate: chlResult?.date || null,
    });
    log.push(`      Ocean data saved for ${today}`);

    // Fetch and save buoy data too
    log.push('\nFetching buoy data...');
    try {
      const buoys = await fetchAllBuoys();
      await saveBuoyData(buoys);
      log.push(`      Buoys saved: ${buoys.length} stations`);
    } catch(e) {
      log.push(`      WARNING: Buoy save failed: ${e.message}`);
    }

    const elapsed = ((Date.now()-start)/1000).toFixed(1);
    log.push(`\n=== Complete in ${elapsed}s ===`);
    console.log(log.join('\n'));

    return res.status(200).json({
      success: true, elapsed: `${elapsed}s`,
      date: today,
      sstPoints:  sstResult?.points?.length  || 0,
      chlPoints:  chlResult?.points?.length  || 0,
      isotherms:  isotherms.length,
      tempBreaks: tempBreaks.length,
      waypoints:  Object.fromEntries(Object.entries(waypoints).map(([k,v])=>[k,v.length])),
    });

  } catch(err) {
    console.error('Pipeline failed:', err);
    log.push(`\nERROR: ${err.message}`);
    return res.status(500).json({ error: err.message, log });
  }
}

// ── Fallback model SST (if NOAA is unreachable) ───────────────────────
function buildModelSST(DG, GG) {
  const mo = new Date().getMonth();
  const SB = [74,74,76,78,80,83,86,87,85,82,79,75][mo];
  const { NX, NY, GL0, GL1, GA0, GA1 } = await import('../lib/ocean.js').then(m=>m);
  const grid = new Float32Array(NX*NY);
  for(let iy=0;iy<NY;iy++) for(let ix=0;ix<NX;ix++) {
    if(DG[iy*NX+ix]<=0) continue;
    const gs=GG[iy*NX+ix];
    const sst=SB+gs*6.0;
    grid[iy*NX+ix]=Math.max(67,Math.min(91,sst));
  }
  return grid;
}

function buildModelChl(DG, GG) {
  const mo = new Date().getMonth();
  const CB = [.55,.65,.75,.90,.80,.50,.38,.30,.40,.70,.80,.65][mo];
  const grid = new Float32Array(NX*NY);
  for(let iy=0;iy<NY;iy++) for(let ix=0;ix<NX;ix++) {
    const dep=DG[iy*NX+ix]; if(dep<=0) continue;
    const sf=Math.max(0,1-dep/200);
    grid[iy*NX+ix]=Math.max(0.02,Math.min(8,CB+sf*3.5-GG[iy*NX+ix]*0.4));
  }
  return grid;
}

// ============================================================
// api/status.js  —  GET /api/status
// Health check — shows data freshness and last fetch times
// ============================================================

import { getLatestOceanData, getLatestBuoys } from '../lib/db.js';
import { FISH } from '../lib/species.js';

export default async function handler(req, res) {
  try {
    const [ocean, buoys] = await Promise.allSettled([
      getLatestOceanData(),
      getLatestBuoys(),
    ]);

    const oceanData  = ocean.status  === 'fulfilled' ? ocean.value  : null;
    const buoyData   = buoys.status  === 'fulfilled' ? buoys.value  : [];

    const hoursOld = oceanData
      ? Math.round((Date.now() - new Date(oceanData.updated_at)) / 36e5)
      : null;

    return res.status(200).json({
      status: 'ok',
      ocean: {
        date:      oceanData?.date      || null,
        sstDate:   oceanData?.sst_date  || null,
        chlDate:   oceanData?.chl_date  || null,
        updatedAt: oceanData?.updated_at || null,
        hoursOld,
        stale:     hoursOld !== null && hoursOld > 26,
        species:   oceanData?.waypoints
          ? Object.fromEntries(
              FISH.map(f => [f.id, (oceanData.waypoints[f.id]||[]).length])
            )
          : null,
      },
      buoys: {
        count:     buoyData.length,
        lastFetch: buoyData[0]?.fetched_at || null,
      },
      environment: {
        supabase: !!process.env.SUPABASE_URL,
        cronSecret: !!process.env.CRON_SECRET,
      },
    });
  } catch(err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

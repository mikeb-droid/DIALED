// ============================================================
// api/conditions.js  —  GET /api/conditions
// Real-time buoy data + NWS marine forecast + GO/NO-GO status
// This endpoint is called directly by the browser every 30 min
// ============================================================

import { fetchAllBuoys, fetchMarineForecast,
         MARINE_ZONES, getGoStatus } from '../lib/noaa.js';
import { saveBuoyData, getLatestBuoys } from '../lib/db.js';

export default async function handler(req, res) {
  const { boat = 'medium', lat, lon } = req.query;

  try {
    // Try to get fresh buoy data
    // If Supabase is configured, also cache it; otherwise just return live
    let buoys;
    try {
      buoys = await fetchAllBuoys();
      // Save to DB in background (don't block response)
      saveBuoyData(buoys).catch(e => console.warn('Buoy cache failed:', e.message));
    } catch(e) {
      console.warn('Live buoy fetch failed, trying cache:', e.message);
      try {
        const cached = await getLatestBuoys();
        buoys = cached || [];
      } catch {
        buoys = [];
      }
    }

    // Fetch marine forecasts for relevant zones based on lat if provided
    // Default: fetch Jacksonville + Flagler + Jupiter zones (covers most of FL east coast)
    const zoneIds = lat && lon
      ? selectZones(parseFloat(lat))
      : ['AMZ632', 'AMZ652', 'AMZ672'];

    const forecasts = await Promise.allSettled(
      zoneIds.map(z => fetchMarineForecast(z))
    ).then(results =>
      results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
    );

    // Calculate GO/CAUTION/NO-GO
    const status = getGoStatus(buoys, forecasts, boat);

    // Format buoys for the response — include nearest to requested point first
    const formattedBuoys = buoys
      .map(b => ({
        id:        b.id,
        name:      b.name,
        lat:       b.lat,
        lon:       b.lon,
        timestamp: b.timestamp,
        wind: b.wind,
        waves: b.waves,
        sst:       b.sst,
        airTemp:   b.airTemp,
        distance:  lat && lon
          ? +( Math.hypot(b.lat-parseFloat(lat), b.lon-parseFloat(lon)) * 60 ).toFixed(0)
          : null,
      }))
      .sort((a,b) => (a.distance||999) - (b.distance||999));

    return res.status(200).json({
      status:    status.status,   // 'GO' | 'CAUTION' | 'NO-GO'
      issues:    status.issues,
      limits:    status.limits,
      buoys:     formattedBuoys,
      forecasts: forecasts.map(f => ({
        zone:    f.zone,
        updated: f.updated,
        periods: f.periods.slice(0,3), // today + next 2 periods
      })),
      fetchedAt: new Date().toISOString(),
    });

  } catch(err) {
    console.error('/api/conditions error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function selectZones(lat) {
  // Return the 2 nearest offshore zone IDs for a latitude
  if (lat >= 30.0) return ['AMZ630', 'AMZ632'];       // Jacksonville area
  if (lat >= 28.5) return ['AMZ632', 'AMZ650'];       // Flagler/Daytona
  if (lat >= 27.0) return ['AMZ650', 'AMZ652'];       // Melbourne/Vero
  if (lat >= 26.0) return ['AMZ652', 'AMZ670'];       // Ft Pierce/Stuart
  return ['AMZ670', 'AMZ672'];                        // Palm Beach/Miami
}

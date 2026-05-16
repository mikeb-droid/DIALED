// ============================================================
// lib/noaa.js  —  NOAA / NASA data fetching
// All sources are free, no API keys required
// ============================================================

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap';
const NDBC   = 'https://www.ndbc.noaa.gov/data/realtime2';
const NWS    = 'https://api.weather.gov';

const LAT_MIN = 24.0, LAT_MAX = 31.5;
const LON_MIN = -82.5, LON_MAX = -76.5;

// ── Date helpers ──────────────────────────────────────────────────────
export function getSSTDate(req) {
  const d = req ? new Date(req) : new Date();
  d.setDate(d.getDate() - 3);                      // MUR SST ~3 day lag
  return d.toISOString().slice(0,10) + 'T09:00:00Z';
}
export function getChlDate(req) {
  const d = req ? new Date(req) : new Date();
  d.setDate(d.getDate() - 7);
  d.setDate(d.getDate() - d.getDay());              // back to Sunday
  return d.toISOString().slice(0,10) + 'T12:00:00Z';
}

function erddapUrl(dataset, variable, time, stride = 4) {
  return `${ERDDAP}/${dataset}.json?${variable}` +
    `[(${time}):1:(${time})]` +
    `[(${LAT_MIN}):${stride}:(${LAT_MAX})]` +
    `[(${LON_MIN}):${stride}:(${LON_MAX})]`;
}

// ── NASA MUR SST (1km daily, Celsius → Fahrenheit) ───────────────────
export async function fetchSST(reqDate) {
  const time = getSSTDate(reqDate);
  const url  = erddapUrl('jplMURSST41', 'analysed_sst', time, 4);
  console.log('[NOAA] Fetching SST', time.slice(0,10));

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'DIALED-FishingChart/1.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) throw new Error(`SST ${resp.status}: ${resp.statusText}`);

  const data = await resp.json();
  const points = data.table.rows
    .filter(r => r[3] !== null && r[3] > -10)
    .map(([,lat,lon,sst]) => ({
      lat: +lat.toFixed(3),
      lon: +lon.toFixed(3),
      sst: +( sst * 9/5 + 32 ).toFixed(1),
    }));

  console.log(`[NOAA] SST: ${points.length} points`);
  return { points, date: time.slice(0,10), source: 'NASA MUR jplMURSST41' };
}

// ── NOAA VIIRS Chlorophyll (weekly, 750m, mg/m³) ─────────────────────
export async function fetchChlorophyll(reqDate) {
  const time = getChlDate(reqDate);
  const url  = erddapUrl('nesdisVHNSQchlaWeekly', 'chlor_a', time, 4);
  console.log('[NOAA] Fetching Chlorophyll', time.slice(0,10));

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'DIALED-FishingChart/1.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) throw new Error(`Chl ${resp.status}: ${resp.statusText}`);

  const data = await resp.json();
  const points = data.table.rows
    .filter(r => r[3] !== null && r[3] > 0 && r[3] < 100)
    .map(([,lat,lon,chl]) => ({
      lat: +lat.toFixed(3),
      lon: +lon.toFixed(3),
      chl: +chl.toFixed(3),
    }));

  console.log(`[NOAA] Chl: ${points.length} points`);
  return { points, date: time.slice(0,10), source: 'NOAA VIIRS nesdisVHNSQchlaWeekly' };
}

// ── NOAA NDBC Buoys (real-time, every 30 min) ─────────────────────────
// FL east coast buoys
export const FL_BUOYS = [
  { id: '41009', name: 'Canaveral 20NM',    lat: 28.508, lon: -80.185 },
  { id: '41010', name: 'Canaveral 120NM',   lat: 28.878, lon: -78.485 },
  { id: '41044', name: 'W Central N Atl',   lat: 28.573, lon: -77.564 },
  { id: '41046', name: 'NE Providence',      lat: 23.822, lon: -75.022 },
  { id: '41047', name: 'NE Bahamas',         lat: 27.514, lon: -71.494 },
  { id: '41048', name: 'W Central N Atl 2', lat: 31.862, lon: -69.590 },
  { id: '41004', name: 'EDISTO',             lat: 32.501, lon: -79.099 },
];

export async function fetchBuoy(buoyId) {
  const url = `${NDBC}/${buoyId}.txt`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const text = await resp.text();
    return parseBuoyText(buoyId, text);
  } catch(e) {
    console.warn(`[NDBC] Buoy ${buoyId} failed:`, e.message);
    return null;
  }
}

function parseBuoyText(id, text) {
  const lines = text.trim().split('\n');
  if (lines.length < 3) return null;

  // Header line 1: column names, line 2: units, line 3+: data
  const headers = lines[0].replace(/^#\s*/,'').trim().split(/\s+/);
  // Most recent data = line 2 (index 2, after two header lines)
  const recent  = lines[2].trim().split(/\s+/);

  const get = (name) => {
    const i = headers.indexOf(name);
    if (i < 0 || i >= recent.length) return null;
    const v = parseFloat(recent[i]);
    return isNaN(v) || recent[i] === 'MM' ? null : v;
  };

  const wdir  = get('WDIR');
  const wspd  = get('WSPD');   // m/s
  const gst   = get('GST');    // m/s
  const wvht  = get('WVHT');   // meters
  const dpd   = get('DPD');    // dominant period seconds
  const mwd   = get('MWD');    // mean wave direction
  const atmp  = get('ATMP');   // air temp C
  const wtmp  = get('WTMP');   // water temp C
  const pres  = get('PRES');   // pressure hPa

  // Parse timestamp
  const yr=recent[0], mo=recent[1], dy=recent[2], hr=recent[3], mn=recent[4];
  const timestamp = `${yr}-${mo}-${dy}T${hr}:${mn}:00Z`;

  const buoyMeta = FL_BUOYS.find(b => b.id === id) || { lat:0, lon:0, name:id };

  return {
    id,
    name:      buoyMeta.name,
    lat:       buoyMeta.lat,
    lon:       buoyMeta.lon,
    timestamp,
    wind: {
      dir:   wdir,
      speed: wspd !== null ? +(wspd * 1.944).toFixed(1) : null,  // m/s → knots
      gust:  gst  !== null ? +(gst  * 1.944).toFixed(1) : null,
      dirLabel: windDirLabel(wdir),
    },
    waves: {
      height: wvht !== null ? +(wvht * 3.281).toFixed(1) : null, // m → ft
      period: dpd,
      dir:    mwd,
      dirLabel: windDirLabel(mwd),
    },
    sst:  wtmp !== null ? +(wtmp * 9/5 + 32).toFixed(1) : null,
    airTemp: atmp !== null ? +(atmp * 9/5 + 32).toFixed(1) : null,
    pressure: pres,
  };
}

export async function fetchAllBuoys() {
  const results = await Promise.allSettled(FL_BUOYS.map(b => fetchBuoy(b.id)));
  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

// ── NWS Marine Zone Forecast ──────────────────────────────────────────
// FL east coast offshore zones
export const MARINE_ZONES = [
  { id: 'AMZ630', name: 'Jacksonville to Flagler Beach 0-20nm' },
  { id: 'AMZ632', name: 'Jacksonville to Flagler Beach 20-60nm' },
  { id: 'AMZ650', name: 'Flagler Beach to Jupiter Inlet 0-20nm' },
  { id: 'AMZ652', name: 'Flagler Beach to Jupiter Inlet 20-60nm' },
  { id: 'AMZ670', name: 'Jupiter Inlet to Deerfield 0-20nm' },
  { id: 'AMZ672', name: 'Jupiter Inlet to Deerfield 20-60nm' },
];

export async function fetchMarineForecast(zoneId) {
  const url = `${NWS}/zones/offshore/${zoneId}/forecast`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'DIALED-FishingChart/1.0 (contact@dialed.app)', Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const periods = data.properties?.periods || [];

    return {
      zone: zoneId,
      updated: data.properties?.updated,
      periods: periods.slice(0,6).map(p => ({
        name:   p.name,
        text:   p.detailedForecast,
        // Parse key conditions from text
        parsed: parseMarineForecast(p.detailedForecast),
      })),
    };
  } catch(e) {
    console.warn(`[NWS] Zone ${zoneId} failed:`, e.message);
    return null;
  }
}

function parseMarineForecast(text) {
  if (!text) return {};
  const t = text.toLowerCase();

  // Extract wind speed (e.g. "winds 10 to 15 kt" or "sw winds around 20 kt")
  const windMatch = t.match(/winds?\s+(?:\w+\s+)?(\d+)\s+to\s+(\d+)\s*k[tn]/);
  const windAround = t.match(/winds?\s+(?:\w+\s+)?around\s+(\d+)\s*k[tn]/);
  let windMin = null, windMax = null;
  if (windMatch) { windMin = +windMatch[1]; windMax = +windMatch[2]; }
  else if (windAround) { windMin = windMax = +windAround[1]; }

  // Extract seas (e.g. "seas 3 to 4 ft" or "seas around 2 ft")
  const seasMatch  = t.match(/seas?\s+(\d+)\s+to\s+(\d+)\s*f[te]/);
  const seasAround = t.match(/seas?\s+around\s+(\d+)\s*f[te]/);
  let seasMin = null, seasMax = null;
  if (seasMatch) { seasMin = +seasMatch[1]; seasMax = +seasMatch[2]; }
  else if (seasAround) { seasMin = seasMax = +seasAround[1]; }

  // Check for hazards
  const hasThunder  = t.includes('thunder');
  const hasSquall   = t.includes('squall');
  const hasFog      = t.includes('fog');
  const hasGale     = t.includes('gale');

  return { windMin, windMax, seasMin, seasMax, hasThunder, hasSquall, hasFog, hasGale };
}

// ── GO / CAUTION / NO-GO calculator ──────────────────────────────────
// boat = 'small' (under 24ft), 'medium' (24-32ft), 'large' (32ft+)
export function getGoStatus(buoys, forecasts, boat = 'medium') {
  const limits = {
    small:  { wind: 15, seas: 2 },
    medium: { wind: 20, seas: 4 },
    large:  { wind: 25, seas: 6 },
  }[boat] || { wind: 20, seas: 4 };

  const issues = [];
  let worstLevel = 'GO';

  // Check buoy data
  for (const b of buoys) {
    if (b.wind?.speed !== null) {
      if (b.wind.speed >= limits.wind * 1.3) {
        issues.push(`${b.name}: winds ${b.wind.speed}kt`);
        worstLevel = 'NO-GO';
      } else if (b.wind.speed >= limits.wind) {
        issues.push(`${b.name}: winds ${b.wind.speed}kt`);
        if (worstLevel !== 'NO-GO') worstLevel = 'CAUTION';
      }
    }
    if (b.waves?.height !== null) {
      if (b.waves.height >= limits.seas * 1.5) {
        issues.push(`${b.name}: seas ${b.waves.height}ft`);
        worstLevel = 'NO-GO';
      } else if (b.waves.height >= limits.seas) {
        issues.push(`${b.name}: seas ${b.waves.height}ft`);
        if (worstLevel !== 'NO-GO') worstLevel = 'CAUTION';
      }
    }
  }

  // Check forecast hazards
  for (const f of forecasts) {
    for (const p of (f?.periods || [])) {
      const parsed = p.parsed || {};
      if (parsed.hasGale || parsed.hasSquall) {
        issues.push(`${f.zone}: ${parsed.hasGale ? 'GALE WARNING' : 'squalls'}`);
        worstLevel = 'NO-GO';
      } else if (parsed.hasThunder) {
        issues.push(`${f.zone}: thunderstorms`);
        if (worstLevel !== 'NO-GO') worstLevel = 'CAUTION';
      }
      if (parsed.windMax && parsed.windMax >= limits.wind) {
        issues.push(`Forecast: winds to ${parsed.windMax}kt`);
        if (worstLevel !== 'NO-GO') worstLevel = 'CAUTION';
      }
      if (parsed.seasMax && parsed.seasMax >= limits.seas) {
        issues.push(`Forecast: seas to ${parsed.seasMax}ft`);
        if (worstLevel !== 'NO-GO') worstLevel = 'CAUTION';
      }
    }
  }

  return { status: worstLevel, issues: [...new Set(issues)], limits };
}

// ── Utilities ─────────────────────────────────────────────────────────
function windDirLabel(deg) {
  if (deg === null || deg === undefined) return null;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                'S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg/22.5) % 16];
}

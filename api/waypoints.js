const { getLatestOceanData, getOceanDataByDate } = require('../lib/db.js');
const { FISH_MAP, lunarPhase } = require('../lib/species.js');

module.exports = async function handler(req, res) {
  const { fish, date } = req.query;
  if (!fish) return res.status(400).json({ error: 'Missing fish parameter. e.g. ?fish=mahi' });
  if (!FISH_MAP[fish]) return res.status(400).json({ error: `Unknown fish: ${fish}`, valid: Object.keys(FISH_MAP) });
  try {
    const row = date ? await getOceanDataByDate(date) : await getLatestOceanData();
    if (!row) return res.status(404).json({ error: 'No ocean data. Run /api/cron-fetch first.' });
    const waypoints = row.waypoints?.[fish] || [];
    const fishData = FISH_MAP[fish];
    const lp = lunarPhase(new Date());
    res.setHeader('Cache-Control','s-maxage=3600,stale-while-revalidate=86400');
    return res.status(200).json({ fish:{id:fish,name:fishData.name,icon:fishData.icon,color:fishData.c,tip:fishData.tip}, waypoints, lunar:lp, date:row.date, updatedAt:row.updated_at });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

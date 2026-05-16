const { getLatestOceanData, getOceanDataByDate } = require('../lib/db.js');

module.exports = async function handler(req, res) {
  const { date, include = 'isotherms,breaks' } = req.query;
  const includes = include.split(',');
  try {
    const row = date ? await getOceanDataByDate(date) : await getLatestOceanData();
    if (!row) return res.status(404).json({ error: 'No ocean data. Run /api/cron-fetch first.' });
    const response = { date:row.date, sstDate:row.sst_date, chlDate:row.chl_date, updatedAt:row.updated_at };
    if(includes.includes('sst'))       response.sstGrid    = row.sst_grid;
    if(includes.includes('chl'))       response.chlGrid    = row.chl_grid;
    if(includes.includes('depth'))     response.depthGrid  = row.depth_grid;
    if(includes.includes('gs'))        response.gsGrid     = row.gs_grid;
    if(includes.includes('isotherms')) response.isotherms  = row.isotherms;
    if(includes.includes('breaks'))    response.tempBreaks = row.temp_breaks;
    res.setHeader('Cache-Control','s-maxage=3600,stale-while-revalidate=86400');
    return res.status(200).json(response);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

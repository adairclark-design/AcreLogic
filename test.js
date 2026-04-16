const item = { start_date: "2026-04-26", crop: { season: "warm" } };
const activeYear = "2026";
const farmProfile = { last_frost_date: "2026-04-15", first_frost_date: "2026-10-15" };
const rawFits = false; // from the engine
const dStr = item.start_date || `${activeYear}-05-01`;
const m = new Date(dStr + (dStr.includes('T') ? '' : 'T12:00:00')).getMonth();
const isSpringWarm = item.crop.season === 'warm' && m >= 2 && m <= 7;
const _lfMD2 = farmProfile?.last_frost_date?.slice(5);
const _itemMD2 = item.start_date?.slice(5);
const isInFarmWindow2 = _itemMD2 && _lfMD2 ? _itemMD2 >= _lfMD2 : false;
const effFits = rawFits || isSpringWarm || isInFarmWindow2;

const _ffMD = farmProfile?.first_frost_date?.slice(5);
const _endMD = "2026-10-22".slice(5);
const isOut = _endMD > _ffMD;

console.log({ m, isSpringWarm, _itemMD2, _lfMD2, isInFarmWindow2, effFits, _ffMD, _endMD, isOut });

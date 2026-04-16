const fs = require('fs');
const crops = JSON.parse(fs.readFileSync('src/data/crops.json'));
const list = Object.values(crops).filter(c => c.category !== 'Cover Crop').slice(0, 10);
const req = list.map(c => c.variety && c.variety !== 'Primary' ? `${c.name} ${c.variety}` : c.name);
console.log(JSON.stringify(req));

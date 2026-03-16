/**
 * AcreLogic Database Service — expo-sqlite
 * On native: full SQLite persistence.
 * On web: in-memory fallback (session only — for preview/demo use).
 */
import { Platform } from 'react-native';
import cropData from '../data/crops.json';

// ─── Web In-Memory Store ──────────────────────────────────────────────────────
const _webStore = {
    farmPlans: {},
    bedAssignments: {},
    calendarEntries: {},
    yieldEstimates: {},
};

// ─── Web Fallback Implementations ─────────────────────────────────────────────
const webDB = {
    async getCropsForWindow(frostFreeDays, seasons = ['cool', 'warm'], excludeCategories = ['Cover Crop']) {
        return cropData.crops.filter(c =>
            c.min_frost_free_days <= frostFreeDays &&
            seasons.includes(c.season) &&
            !excludeCategories.includes(c.category)
        ).sort((a, b) => a.dtm - b.dtm);
    },
    async getCropById(id) {
        return cropData.crops.find(c => c.id === id) ?? null;
    },
    async getSuccessionCandidates(previousCropId, remainingDays, seasonClass) {
        const prev = cropData.crops.find(c => c.id === previousCropId);
        if (!prev) return [];
        return cropData.crops.filter(c =>
            c.min_frost_free_days <= remainingDays &&
            c.season === seasonClass &&
            c.category !== 'Cover Crop' &&
            !(c.rotation_cannot_follow ?? []).includes(prev.category?.toLowerCase())
        );
    },
    async createFarmPlan(data) {
        const id = `plan_${Date.now()}`;
        _webStore.farmPlans[id] = { id, ...data };
        return id;
    },
    async getFarmPlan(planId) { return _webStore.farmPlans[planId] ?? null; },
    async getLatestFarmPlan() { return Object.values(_webStore.farmPlans).slice(-1)[0] ?? null; },
    async updateFarmPlan(planId, updates) { _webStore.farmPlans[planId] = { ..._webStore.farmPlans[planId], ...updates }; },
    async saveBedAssignment(planId, bedNumber, slot, data) {
        const id = `bed_${planId}_${bedNumber}_${slot}`;
        if (!_webStore.bedAssignments[planId]) _webStore.bedAssignments[planId] = {};
        _webStore.bedAssignments[planId][id] = { id, planId, bedNumber, slot, ...data };
        return id;
    },
    async getBedAssignments(planId) { return Object.values(_webStore.bedAssignments[planId] ?? {}); },
    async getBedSuccessions(planId, bedNumber) {
        return Object.values(_webStore.bedAssignments[planId] ?? {}).filter(b => b.bedNumber === bedNumber);
    },
    async saveCalendarEntry(planId, entry) {
        const id = `cal_${planId}_${entry.bed_number}_${entry.action}_${entry.entry_date}`;
        if (!_webStore.calendarEntries[planId]) _webStore.calendarEntries[planId] = {};
        _webStore.calendarEntries[planId][id] = { id, planId, ...entry };
    },
    async getCalendarEntries(planId) {
        return Object.values(_webStore.calendarEntries[planId] ?? {}).sort((a, b) => a.entry_date?.localeCompare(b.entry_date));
    },
    async saveYieldEstimate(planId, estimate) {
        const id = `yield_${planId}_${estimate.bed_number}_${estimate.succession_slot}`;
        if (!_webStore.yieldEstimates[planId]) _webStore.yieldEstimates[planId] = {};
        _webStore.yieldEstimates[planId][id] = { id, planId, ...estimate };
    },
    async getYieldEstimates(planId) { return Object.values(_webStore.yieldEstimates[planId] ?? {}); },
};

// ─── SQLite Native DB (lazy-loaded on native only) ────────────────────────────
let _db = null;
async function getDB() {
    if (_db) return _db;
    const SQLite = await import('expo-sqlite');
    _db = await SQLite.openDatabaseAsync('acrelogic.db');
    await _db.execAsync('PRAGMA journal_mode = WAL;');
    await initSchema(_db);
    return _db;
}

// ─── Schema ────────────────────────────────────────────────────────────────────
async function initSchema(db) {
    await db.execAsync(`
    -- ── Crops (seeded from crops.json on first run) ───────────────────────────
    CREATE TABLE IF NOT EXISTS crops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      variety TEXT,
      category TEXT NOT NULL,
      emoji TEXT,
      dtm INTEGER NOT NULL,
      harvest_window_days INTEGER,
      seed_type TEXT CHECK(seed_type IN ('DS','TP')) NOT NULL,
      seed_start_weeks INTEGER,
      season TEXT CHECK(season IN ('cool','warm','year_round')) NOT NULL,
      min_frost_free_days INTEGER NOT NULL,
      max_temp_f INTEGER,
      rows_per_30in_bed INTEGER,
      in_row_spacing_in REAL,
      row_spacing_in REAL,
      seed_oz_per_100ft REAL,
      loss_buffer_pct REAL DEFAULT 20,
      yield_lbs_per_100ft REAL,
      yield_unit TEXT,
      yield_bunches_per_100ft INTEGER,
      wholesale_price_per_lb REAL,
      wholesale_price_per_bunch REAL,
      organic_premium_pct REAL DEFAULT 0,
      jang_model TEXT,
      jang_wheel TEXT,
      jang_finger TEXT,
      jang_brush TEXT,
      jang_notes TEXT,
      feed_class TEXT CHECK(feed_class IN ('heavy','light','legume','cover_crop')) NOT NULL,
      rotation_cannot_follow TEXT, -- JSON array string
      rotation_prefers_after TEXT, -- JSON array string
      interplant_compatible TEXT,  -- JSON array string
      notes TEXT
    );

    -- ── Farm Plans ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS farm_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'My Farm',
      address TEXT,
      lat REAL,
      lon REAL,
      frost_free_days INTEGER,
      last_frost_date TEXT,
      first_frost_date TEXT,
      usda_zone TEXT,
      soil_type TEXT,
      elevation_ft INTEGER,
      sun_exposure TEXT,
      num_beds INTEGER DEFAULT 8,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Bed Assignments ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bed_assignments (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES farm_plans(id) ON DELETE CASCADE,
      bed_number INTEGER NOT NULL,
      succession_slot INTEGER NOT NULL DEFAULT 1, -- 1=primary, 2=second, 3=third, etc.
      crop_id TEXT REFERENCES crops(id),
      start_date TEXT,              -- ISO date: YYYY-MM-DD
      end_date TEXT,                -- ISO date: DTM + harvest window
      action TEXT,                  -- 'direct_seed' | 'transplant' | 'cover_crop'
      rows_used INTEGER,
      plants_count INTEGER,
      seed_amount_oz REAL,
      seed_amount_lbs REAL,
      seed_amount_label TEXT,       -- human-readable e.g. "1/8 lb"
      jang_config TEXT,             -- JSON: {model, wheel, finger, brush}
      interplant_crop_id TEXT,
      interplant_plants_count INTEGER,
      notes TEXT,
      is_auto_generated INTEGER DEFAULT 0,
      user_verified INTEGER DEFAULT 0,
      UNIQUE(plan_id, bed_number, succession_slot)
    );

    -- ── Calendar Entries (derived from bed_assignments) ───────────────────────
    CREATE TABLE IF NOT EXISTS calendar_entries (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES farm_plans(id) ON DELETE CASCADE,
      bed_number INTEGER NOT NULL,
      bed_label TEXT,               -- "Bed A6"
      entry_date TEXT NOT NULL,     -- ISO date
      action TEXT NOT NULL,         -- 'direct_seed' | 'transplant' | 'seed_start' | 'cover_crop'
      crop_id TEXT REFERENCES crops(id),
      crop_name TEXT,
      crop_variety TEXT,
      seed_amount_label TEXT,
      plant_count INTEGER,
      row_count INTEGER,
      spacing_label TEXT,
      jang_config_label TEXT,       -- "JANG XJ24 F11B14"
      dtm INTEGER,
      special_notes TEXT,           -- "Trellised" | "Interplanted with: Basil"
      estimated_harvest_date TEXT
    );

    -- ── Yield Estimates ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS yield_estimates (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES farm_plans(id) ON DELETE CASCADE,
      bed_number INTEGER NOT NULL,
      crop_id TEXT REFERENCES crops(id),
      crop_name TEXT,
      crop_variety TEXT,
      succession_slot INTEGER,
      estimated_yield_lbs REAL,
      estimated_yield_bunches INTEGER,
      price_per_lb REAL,
      price_per_bunch REAL,
      gross_revenue_low REAL,
      gross_revenue_high REAL,
      bed_days_used INTEGER,
      notes TEXT
    );

    -- ── Pricing Cache (USDA AMS) ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS pricing_cache (
      crop_name TEXT PRIMARY KEY,
      price_per_lb_organic REAL,
      price_per_bunch_organic REAL,
      region TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

    await seedCropsIfEmpty(db);
}

// ─── Seed crop data from crops.json ───────────────────────────────────────────
async function seedCropsIfEmpty(db) {
    const result = await db.getFirstAsync('SELECT COUNT(*) as count FROM crops');
    if (result.count > 0) return; // Already seeded

    const crops = cropData.crops;
    for (const crop of crops) {
        await db.runAsync(
            `INSERT OR REPLACE INTO crops (
        id, name, variety, category, emoji, dtm, harvest_window_days, seed_type,
        seed_start_weeks, season, min_frost_free_days, max_temp_f, rows_per_30in_bed,
        in_row_spacing_in, row_spacing_in, seed_oz_per_100ft, loss_buffer_pct,
        yield_lbs_per_100ft, yield_unit, yield_bunches_per_100ft,
        wholesale_price_per_lb, wholesale_price_per_bunch, organic_premium_pct,
        jang_model, jang_wheel, jang_finger, jang_brush, jang_notes,
        feed_class, rotation_cannot_follow, rotation_prefers_after,
        interplant_compatible, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                crop.id, crop.name, crop.variety, crop.category, crop.emoji,
                crop.dtm, crop.harvest_window_days, crop.seed_type,
                crop.seed_start_weeks_before_transplant, crop.season,
                crop.min_frost_free_days, crop.max_temp_f, crop.rows_per_30in_bed,
                crop.in_row_spacing_in, crop.row_spacing_in, crop.seed_oz_per_100ft,
                crop.loss_buffer_pct, crop.yield_lbs_per_100ft, crop.yield_unit,
                crop.yield_bunches_per_100ft, crop.wholesale_price_per_lb,
                crop.wholesale_price_per_bunch, crop.organic_premium_pct,
                crop.jang_seeder?.model ?? null, crop.jang_seeder?.wheel ?? null,
                crop.jang_seeder?.finger_plate ?? null, crop.jang_seeder?.brush_plate ?? null,
                crop.jang_seeder?.notes ?? null,
                crop.feed_class,
                JSON.stringify(crop.rotation_cannot_follow ?? []),
                JSON.stringify(crop.rotation_prefers_after ?? []),
                JSON.stringify(crop.interplant_compatible ?? []),
                crop.notes,
            ]
        );
    }
    console.log(`[DB] Seeded ${crops.length} crops from crops.json`);
}

// ─── Crop Queries — Platform Routed ──────────────────────────────────────────
export async function getCropsForWindow(frostFreeDays, seasons = ['cool', 'warm'], excludeCategories = ['Cover Crop']) {
    if (Platform.OS === 'web') return webDB.getCropsForWindow(frostFreeDays, seasons, excludeCategories);
    const db = await getDB();
    const seasonPlaceholders = seasons.map(() => '?').join(',');
    const excludePlaceholders = excludeCategories.map(() => '?').join(',');
    return db.getAllAsync(
        `SELECT * FROM crops WHERE min_frost_free_days <= ? AND season IN (${seasonPlaceholders}) AND category NOT IN (${excludePlaceholders}) ORDER BY dtm ASC`,
        [frostFreeDays, ...seasons, ...excludeCategories]
    );
}

export async function getCropById(id) {
    if (Platform.OS === 'web') return webDB.getCropById(id);
    const db = await getDB();
    return db.getFirstAsync('SELECT * FROM crops WHERE id = ?', [id]);
}

export async function getSuccessionCandidates(previousCropId, remainingDays, seasonClass) {
    if (Platform.OS === 'web') return webDB.getSuccessionCandidates(previousCropId, remainingDays, seasonClass);
    const db = await getDB();
    const prev = await getCropById(previousCropId);
    if (!prev) return [];
    const allCandidates = await getCropsForWindow(remainingDays, [seasonClass], ['Cover Crop']);
    return allCandidates.filter(crop => {
        const cannot = JSON.parse(crop.rotation_cannot_follow || '[]');
        return !cannot.includes(prev.category?.toLowerCase()) && !cannot.includes(prev.id);
    });
}

// ─── Farm Plan CRUD ───────────────────────────────────────────────────────────
export async function createFarmPlan(data) {
    if (Platform.OS === 'web') return webDB.createFarmPlan(data);
    const db = await getDB();
    const id = `plan_${Date.now()}`;
    await db.runAsync(
        `INSERT INTO farm_plans (id, name, address, lat, lon, frost_free_days,
       last_frost_date, first_frost_date, usda_zone, soil_type, elevation_ft,
       sun_exposure, num_beds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id, data.name ?? 'My Farm', data.address, data.lat, data.lon,
            data.frost_free_days, data.last_frost_date, data.first_frost_date,
            data.usda_zone, data.soil_type, data.elevation_ft, data.sun_exposure,
            data.num_beds ?? 8,
        ]
    );
    return id;
}

export async function getFarmPlan(planId) {
    if (Platform.OS === 'web') return webDB.getFarmPlan(planId);
    const db = await getDB();
    return db.getFirstAsync('SELECT * FROM farm_plans WHERE id = ?', [planId]);
}

export async function getLatestFarmPlan() {
    if (Platform.OS === 'web') return webDB.getLatestFarmPlan();
    const db = await getDB();
    return db.getFirstAsync('SELECT * FROM farm_plans ORDER BY created_at DESC LIMIT 1');
}

export async function updateFarmPlan(planId, updates) {
    if (Platform.OS === 'web') return webDB.updateFarmPlan(planId, updates);
    const db = await getDB();
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.runAsync(
        `UPDATE farm_plans SET ${fields}, updated_at = datetime('now') WHERE id = ?`,
        [...Object.values(updates), planId]
    );
}

// ─── Bed Assignment CRUD ──────────────────────────────────────────────────────
export async function saveBedAssignment(planId, bedNumber, slot, data) {
    if (Platform.OS === 'web') return webDB.saveBedAssignment(planId, bedNumber, slot, data);
    const db = await getDB();
    const id = `bed_${planId}_${bedNumber}_${slot}`;
    await db.runAsync(
        `INSERT OR REPLACE INTO bed_assignments
       (id, plan_id, bed_number, succession_slot, crop_id, start_date, end_date,
        action, rows_used, plants_count, seed_amount_oz, seed_amount_lbs,
        seed_amount_label, jang_config, interplant_crop_id, interplant_plants_count,
        notes, is_auto_generated, user_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id, planId, bedNumber, slot,
            data.crop_id, data.start_date, data.end_date, data.action,
            data.rows_used, data.plants_count, data.seed_amount_oz,
            data.seed_amount_lbs, data.seed_amount_label,
            data.jang_config ? JSON.stringify(data.jang_config) : null,
            data.interplant_crop_id, data.interplant_plants_count,
            data.notes, data.is_auto_generated ? 1 : 0, data.user_verified ? 1 : 0,
        ]
    );
    return id;
}

export async function getBedAssignments(planId) {
    if (Platform.OS === 'web') return webDB.getBedAssignments(planId);
    const db = await getDB();
    const rows = await db.getAllAsync(
        `SELECT ba.*, c.name as crop_name, c.variety, c.emoji, c.dtm, c.category,
            c.feed_class, c.jang_model, c.jang_wheel, c.jang_finger, c.jang_brush
     FROM bed_assignments ba
     LEFT JOIN crops c ON ba.crop_id = c.id
     WHERE ba.plan_id = ?
     ORDER BY ba.bed_number, ba.succession_slot`,
        [planId]
    );
    return rows;
}

export async function getBedSuccessions(planId, bedNumber) {
    if (Platform.OS === 'web') return webDB.getBedSuccessions(planId, bedNumber);
    const db = await getDB();
    return db.getAllAsync(
        `SELECT ba.*, c.name, c.variety, c.emoji, c.dtm, c.harvest_window_days, c.feed_class
     FROM bed_assignments ba
     LEFT JOIN crops c ON ba.crop_id = c.id
     WHERE ba.plan_id = ? AND ba.bed_number = ?
     ORDER BY ba.succession_slot`,
        [planId, bedNumber]
    );
}

// ─── Calendar Entries ─────────────────────────────────────────────────────────
export async function saveCalendarEntry(planId, entry) {
    if (Platform.OS === 'web') return webDB.saveCalendarEntry(planId, entry);
    const db = await getDB();
    const id = `cal_${planId}_${entry.bed_number}_${entry.action}_${entry.entry_date}`;
    await db.runAsync(
        `INSERT OR REPLACE INTO calendar_entries
       (id, plan_id, bed_number, bed_label, entry_date, action, crop_id,
        crop_name, crop_variety, seed_amount_label, plant_count, row_count,
        spacing_label, jang_config_label, dtm, special_notes, estimated_harvest_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id, planId, entry.bed_number, entry.bed_label, entry.entry_date, entry.action,
            entry.crop_id, entry.crop_name, entry.crop_variety, entry.seed_amount_label,
            entry.plant_count, entry.row_count, entry.spacing_label, entry.jang_config_label,
            entry.dtm, entry.special_notes, entry.estimated_harvest_date,
        ]
    );
}

export async function getCalendarEntries(planId) {
    if (Platform.OS === 'web') return webDB.getCalendarEntries(planId);
    const db = await getDB();
    return db.getAllAsync(
        'SELECT * FROM calendar_entries WHERE plan_id = ? ORDER BY entry_date, bed_number',
        [planId]
    );
}

// ─── Yield Estimates ──────────────────────────────────────────────────────────
export async function saveYieldEstimate(planId, estimate) {
    if (Platform.OS === 'web') return webDB.saveYieldEstimate(planId, estimate);
    const db = await getDB();
    const id = `yield_${planId}_${estimate.bed_number}_${estimate.succession_slot}`;
    await db.runAsync(
        `INSERT OR REPLACE INTO yield_estimates
       (id, plan_id, bed_number, crop_id, crop_name, crop_variety, succession_slot,
        estimated_yield_lbs, estimated_yield_bunches, price_per_lb, price_per_bunch,
        gross_revenue_low, gross_revenue_high, bed_days_used, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id, planId, estimate.bed_number, estimate.crop_id, estimate.crop_name,
            estimate.crop_variety, estimate.succession_slot, estimate.estimated_yield_lbs,
            estimate.estimated_yield_bunches, estimate.price_per_lb, estimate.price_per_bunch,
            estimate.gross_revenue_low, estimate.gross_revenue_high,
            estimate.bed_days_used, estimate.notes,
        ]
    );
}

export async function getYieldEstimates(planId) {
    if (Platform.OS === 'web') return webDB.getYieldEstimates(planId);
    const db = await getDB();
    return db.getAllAsync(
        'SELECT * FROM yield_estimates WHERE plan_id = ? ORDER BY bed_number, succession_slot',
        [planId]
    );
}

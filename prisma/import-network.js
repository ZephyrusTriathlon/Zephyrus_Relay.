import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { Brand, DockType, ParkingConstraint, VehicleType, TemperatureCapability, FuelType, RecordSource } from '../packages/domain/src/index.js';

export const defaultDataDir = fileURLToPath(new URL('../data/', import.meta.url));
const text = z.string().min(1).max(100);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const positive = z.string().regex(/^\d+(?:\.\d{1,3})?$/).refine(value => Number(value) > 0 && Number(value) < 1000000);
const flag = z.enum(['0', '1']).transform(value => value === '1');
const integer = (min, max) => z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));
const sourceEnum = values => z.string().transform(value => value.toUpperCase()).pipe(z.enum(Object.values(values)));
export const depotId = name => `depot-${name.toLowerCase().replace(/\s+/g, '-')}`;
const outletSchema = z.object({
  outlet_id: z.string().regex(/^OUT\d{3}$/), brand: sourceEnum(Brand), district: text,
  depot: text.regex(/^[A-Za-z ]+$/), dock_type: sourceEnum(DockType), parking_constraint: sourceEnum(ParkingConstraint),
  mall_window: z.union([z.literal(''), z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/)]),
  window_open_time: time, window_close_time: time
}).strict().refine(row => row.window_open_time < row.window_close_time, { path: ['window_close_time'] })
  .refine(row => !row.mall_window || row.mall_window.slice(0, 5) < row.mall_window.slice(6), { path: ['mall_window'] });
const vehicleSchema = z.object({
  vehicle_id: z.string().regex(/^VEH\d{3}$/), type: sourceEnum(VehicleType), temp: sourceEnum(TemperatureCapability),
  weight_cap_kg: positive, volume_cap_m3: positive, fuel_type: sourceEnum(FuelType), km_per_l: positive,
  weekly_fuel_quota_l: positive, depot: text.regex(/^[A-Za-z ]+$/)
}).strict();
const calendarSchema = z.object({
  date: z.iso.date(), dow: integer(0, 6), dow_name: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  is_weekend: flag, iso_year: integer(1900, 2200), iso_week: integer(1, 53), is_payday: flag,
  festival: z.string().max(100), festival_ramp: z.string().regex(/^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?)$/),
  is_holiday: flag, monsoon: flag, is_operating: flag
}).strict();
const headers = {
  'outlets.csv': 'outlet_id,brand,district,depot,dock_type,parking_constraint,mall_window,window_open_time,window_close_time',
  'vehicles.csv': 'vehicle_id,type,temp,weight_cap_kg,volume_cap_m3,fuel_type,km_per_l,weekly_fuel_quota_l,depot',
  'calendar.csv': 'date,dow,dow_name,is_weekend,iso_year,iso_week,is_payday,festival,festival_ramp,is_holiday,monsoon,is_operating'
};

// Parse arrays first: reject unknown/duplicate headers before constructing objects.
// Failures identify location only; never echo confidential row values.
export function parseDataset(contents, filename, schema = { 'outlets.csv': outletSchema, 'vehicles.csv': vehicleSchema, 'calendar.csv': calendarSchema }[filename]) {
  let rows;
  try { rows = parse(contents, { bom: true, skip_empty_lines: true, trim: true, max_record_size: 4096 }); }
  catch { throw new Error(`${filename}: invalid CSV structure`); }
  if (!rows.length || rows[0].join(',') !== headers[filename]) throw new Error(`${filename}: unexpected columns`);
  if (rows.length === 1) throw new Error(`${filename}: empty dataset`);
  return rows.slice(1).map((row, index) => {
    const result = schema.safeParse(Object.fromEntries(rows[0].map((key, column) => [key, row[column]])));
    if (!result.success) throw new Error(`${filename}: invalid row ${index + 2}, field ${result.error.issues[0].path.join('.') || 'record'}`);
    return result.data;
  });
}
function unique(rows, key, filename) {
  if (new Set(rows.map(row => row[key])).size !== rows.length) throw new Error(`${filename}: duplicate primary keys`);
}
export async function loadNetwork(dataDir = process.env.RELAY_DATA_DIR || defaultDataDir) {
  async function load(filename, schema) {
    let contents;
    try { contents = await readFile(path.join(dataDir, 'General Data', filename), 'utf8'); }
    catch { throw new Error(`${filename}: dataset unavailable in configured data directory`); }
    return parseDataset(contents, filename, schema);
  }
  const [outletRows, vehicleRows, calendarRows] = await Promise.all([
    load('outlets.csv', outletSchema), load('vehicles.csv', vehicleSchema), load('calendar.csv', calendarSchema)
  ]);
  if (outletRows.length !== 120 || vehicleRows.length !== 60) throw new Error('Network must contain exactly 120 outlets and 60 vehicles');
  unique(outletRows, 'outlet_id', 'outlets.csv'); unique(vehicleRows, 'vehicle_id', 'vehicles.csv'); unique(calendarRows, 'date', 'calendar.csv');
  const depots = [...new Set(outletRows.map(row => row.depot))].sort();
  if (depots.length !== 2 || new Set(vehicleRows.map(row => row.depot)).size !== 2 || vehicleRows.some(row => !depots.includes(row.depot))) throw new Error('Network must reference the same two depots');
  for (const [index, row] of calendarRows.entries()) {
    const date = new Date(`${row.date}T00:00:00Z`);
    const dow = (date.getUTCDay() + 6) % 7;
    const thursday = new Date(date); thursday.setUTCDate(date.getUTCDate() + 3 - dow);
    const isoYear = thursday.getUTCFullYear();
    const isoWeek = Math.ceil((((thursday - new Date(Date.UTC(isoYear, 0, 1))) / 86400000) + 1) / 7);
    // The supplied business calendar treats Sunday only as weekend; preserve its flags.
    if (row.dow !== dow || row.dow_name !== ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dow] || row.iso_year !== isoYear || row.iso_week !== isoWeek) throw new Error(`calendar.csv: inconsistent date metadata at row ${index + 2}`);
  }
  const source = RecordSource.SUPPLIED;
  return {
    depots: depots.map(name => ({ id: depotId(name), name, source })),
    outlets: outletRows.map(row => ({ id: row.outlet_id, brand: row.brand, district: row.district, depotId: depotId(row.depot), dockType: row.dock_type, parkingConstraint: row.parking_constraint, mallWindow: row.mall_window || null, windowOpenTime: row.window_open_time, windowCloseTime: row.window_close_time, source })).sort((a,b) => a.id.localeCompare(b.id)),
    vehicles: vehicleRows.map(row => ({ id: row.vehicle_id, type: row.type, temperature: row.temp, weightCapacityKg: row.weight_cap_kg, volumeCapacityM3: row.volume_cap_m3, fuelType: row.fuel_type, kmPerLitre: row.km_per_l, weeklyFuelQuotaL: row.weekly_fuel_quota_l, depotId: depotId(row.depot), source })).sort((a,b) => a.id.localeCompare(b.id)),
    calendar: calendarRows.map(row => ({ date: new Date(`${row.date}T00:00:00Z`), dayOfWeek: row.dow, dayName: row.dow_name, isWeekend: row.is_weekend, isoYear: row.iso_year, isoWeek: row.iso_week, isPayday: row.is_payday, festival: row.festival || null, festivalRamp: row.festival_ramp, isHoliday: row.is_holiday, monsoon: row.monsoon, isOperating: row.is_operating, source })).sort((a,b) => a.date - b.date)
  };
}

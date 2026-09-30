const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const header = 'outlet_id,brand,district,depot,dock_type,parking_constraint,mall_window,window_open_time,window_close_time';
const synthetic = 'OUT999,Fresh,"Demo, district",Example Depot,street,normal,,03:00,08:00';

test('CSV parser handles quoted commas/BOM and rejects malformed or invalid records without disclosing contents', async () => {
  const { parseDataset } = await import('../prisma/import-network.js');
  const rows = parseDataset(`\uFEFF${header}\n${synthetic}\n`, 'outlets.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].district, 'Demo, district');
  assert.equal(rows[0].brand, 'FRESH');
  for (const input of [
    `${header}\n"broken`, `${header}\n${synthetic.replace('03:00', '99:00')}`,
    `${header}\n${synthetic.replace('Fresh', 'SECRET_INVALID_VALUE')}`, `${header},outlet_id\n${synthetic},OUT999`,
    `${header}\n`, `${header}\n${synthetic},extra`
  ]) {
    assert.throws(() => parseDataset(input, 'outlets.csv'), error => error.message.startsWith('outlets.csv:') && !error.message.includes('SECRET_INVALID_VALUE'));
  }
});

test('shared domain constants exactly match Prisma enums', async () => {
  const domain = await import('../packages/domain/src/index.js');
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  for (const [, name, body] of schema.matchAll(/enum (\w+)\s*\{([^}]+)\}/g)) {
    const constants = domain[name === 'Role' ? 'Roles' : name];
    assert.ok(constants, name);
    assert.deepEqual(Object.values(constants).sort(), body.trim().split(/\s+/).sort(), name);
    assert.ok(Object.isFrozen(constants), name);
  }
});

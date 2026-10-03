// Public synthetic reference network. No competition CSV is read or copied.
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../prisma/judge-data/General Data/', import.meta.url);
await mkdir(root, { recursive: true });
const csv = (name, header, rows) => writeFile(new URL(name, root), [header, ...rows.map(r => r.join(','))].join('\n') + '\n');
await csv('outlets.csv', 'outlet_id,brand,district,depot,dock_type,parking_constraint,mall_window,window_open_time,window_close_time',
  Array.from({length:120}, (_,i) => [`OUT${String(i+1).padStart(3,'0')}`, i<40?'Fresh':i<80?'Style':'Tech',i<60?'Colombo':'Kandy',i<60?'Peliyagoda':'Kandy', 'street',i<3?'van_only':'normal','',i<40?'03:00':'08:00',i<40?'08:00':'18:00']));
await csv('vehicles.csv', 'vehicle_id,type,temp,weight_cap_kg,volume_cap_m3,fuel_type,km_per_l,weekly_fuel_quota_l,depot',
  Array.from({length:60},(_,i)=>[`VEH${String(i+1).padStart(3,'0')}`,i%2?'van':'truck','reefer',i%2?1000:5000,i%2?8:25,'diesel',i%2?10:5,400,i<40?'Peliyagoda':'Kandy']));
const days=[];
for(let d=new Date('2024-01-01T00:00:00Z');d<=new Date('2026-06-28T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)) {
  const dow=(d.getUTCDay()+6)%7, thursday=new Date(d);thursday.setUTCDate(d.getUTCDate()+3-dow);
  const year=thursday.getUTCFullYear(), week=Math.ceil(((thursday-new Date(Date.UTC(year,0,1)))/86400000+1)/7);
  days.push([d.toISOString().slice(0,10),dow,['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dow],dow===6?1:0,year,week,0,'',0,0,0,dow===6?0:1]);
}
await csv('calendar.csv','date,dow,dow_name,is_weekend,iso_year,iso_week,is_payday,festival,festival_ramp,is_holiday,monsoon,is_operating',days);
await csv('district_travel.csv','district,depot,depot_to_district_km,depot_to_district_freeflow_min,inter_stop_km,inter_stop_freeflow_min',[
  ['Colombo','Peliyagoda',15,30,3,10],['Kandy','Kandy',15,30,3,10]]);
await csv('service_allowance.csv','brand,dock_type,service_allowance_min', ['Fresh','Style','Tech'].flatMap(b=>['street','rear_dock','mall_bay'].map(d=>[b,d,10])));

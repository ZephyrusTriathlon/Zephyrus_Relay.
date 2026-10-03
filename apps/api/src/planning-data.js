import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

const positive=z.coerce.number().finite().positive();
const travelSchema=z.object({district:z.string().min(1),depot:z.string().min(1),depot_to_district_km:positive,depot_to_district_freeflow_min:positive,inter_stop_km:positive,inter_stop_freeflow_min:positive});
const serviceSchema=z.object({brand:z.enum(['Fresh','Style','Tech']),dock_type:z.enum(['street','rear_dock','mall_bay']),service_allowance_min:positive});
export async function loadPlanningData(depots, directory=process.env.RELAY_DATA_DIR || fileURLToPath(new URL('../../../prisma/judge-data/',import.meta.url))) {
  directory=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)),directory);
  const read=async(file,schema)=>parse(await readFile(path.join(directory,'General Data',file),'utf8'),{columns:true,bom:true,skip_empty_lines:true}).map(row=>schema.parse(row));
  const [rawTravel,rawService]=await Promise.all([read('district_travel.csv',travelSchema),read('service_allowance.csv',serviceSchema)]);
  const travel=rawTravel.map(row=>{
    const depot=depots.find(d=>d.name===row.depot);
    if(!depot)throw new Error('Travel data references an unknown depot');
    return {depotId:depot.id,district:row.district,outboundKm:row.depot_to_district_km,outboundMinutes:row.depot_to_district_freeflow_min,interStopKm:row.inter_stop_km,interStopMinutes:row.inter_stop_freeflow_min};
  });
  const service=rawService.map(row=>({brand:row.brand.toUpperCase(),dockType:row.dock_type.toUpperCase(),minutes:row.service_allowance_min}));
  if(new Set(travel.map(r=>`${r.depotId}/${r.district}`)).size!==travel.length||new Set(service.map(r=>`${r.brand}/${r.dockType}`)).size!==service.length)throw new Error('Duplicate planning reference records');
  return {travel,service};
}

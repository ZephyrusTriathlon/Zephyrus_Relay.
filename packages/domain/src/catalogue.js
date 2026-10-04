// Application catalogue: carton specifications, not stock or demand predictions.
export const catalogue = Object.freeze([
  {code:'WPF-MILK-1L',name:'Fresh milk · chilled',size:'1 L · 12 packs / carton',weight:13,volume:0.032,temp:'chilled'},
  {code:'WPF-PROD-MIX',name:'Fresh produce crate',size:'Mixed produce · 1 crate / carton',weight:9,volume:0.055,temp:'chilled'},
  {code:'WPF-DRY-24',name:'Dry grocery essentials',size:'24 packs / carton',weight:6,volume:0.041,temp:'ambient'},
  {code:'WPF-HOME-12',name:'Household care pack',size:'12 packs / carton',weight:7,volume:0.046,temp:'ambient'},
  {code:'WPF-WATER-6',name:'Bottled water',size:'1.5 L · 6 bottles / carton',weight:10,volume:0.038,temp:'ambient'},
  {code:'WPF-FROZEN-10',name:'Frozen vegetables',size:'10 × 1 kg packs / carton',weight:11,volume:0.035,temp:'frozen'}
].map(Object.freeze));

export function canonicalOrder(input) {
  const items=input.items.map(item=>{
    const product=catalogue.find(p=>p.code===item.productCode);
    if(!product)throw new Error('Choose a product from the current catalogue.');
    if(product.temp.toUpperCase()!==input.temperatureRequirement)throw new Error('Each order must contain products of its selected temperature category.');
    if((item.unitWeightKg!==undefined&&item.unitWeightKg!==product.weight)||
       (item.unitVolumeM3!==undefined&&item.unitVolumeM3!==product.volume)||
       (item.description!==undefined&&item.description!==product.name))throw new Error('Product specifications changed. Refresh the catalogue and review your order.');
    return {productCode:product.code,description:product.name,units:item.units,unitWeightKg:product.weight,unitVolumeM3:product.volume};
  });
  if(new Set(items.map(i=>i.productCode)).size!==items.length)throw new Error('Each product must appear only once in an order.');
  return {...input,items};
}

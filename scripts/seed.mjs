import { execSync } from 'node:child_process';

const now = Math.floor(Date.now() / 1000);
const products = [
  ['10000000-0000-4000-8000-000000000001', 'field-tee', 'Field Tee'],
  ['10000000-0000-4000-8000-000000000002', 'utility-long-sleeve', 'Utility Long Sleeve'],
  ['10000000-0000-4000-8000-000000000003', 'daily-crew', 'Daily Crew'],
];
const statements = products.map(([id, slug, name], index) => {
  const colorId = `20000000-0000-4000-8000-00000000000${index + 1}`;
  const variantId = `30000000-0000-4000-8000-00000000000${index + 1}`;
  return `INSERT OR IGNORE INTO products (id,slug,name,description,base_price_cents,currency,status,created_at,updated_at) VALUES ('${id}','${slug}','${name}','A considered everyday layer.',${3200 + index * 500},'usd','draft',${now},${now}); INSERT OR IGNORE INTO product_colors (id,product_id,name,hex,sort) VALUES ('${colorId}','${id}','Carbon','#26394A',0); INSERT OR IGNORE INTO product_variants (id,product_id,color_id,size,stock) VALUES ('${variantId}','${id}','${colorId}','M',8);`;
}).join(' ');
execSync(`npx wrangler d1 execute idek-shirts --local --command "${statements}"`, { stdio: 'inherit' });

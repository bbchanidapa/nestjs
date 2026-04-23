const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const schema = process.env.DB_SCHEMA || 'public';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
  throw new Error(`Invalid DB_SCHEMA value: ${schema}`);
}

const quotedSchema = `"${schema}"`;
const productsTable = `${quotedSchema}."inventory_products"`;
const warehousesTable = `${quotedSchema}."inventory_warehouses"`;
const balancesTable = `${quotedSchema}."inventory_balances"`;

const mockProducts = [
  {
    sku: 'BEV-COKE-330',
    name: 'Coca-Cola Original 330ml',
    unit: 'can',
    imageUrl:
      'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'BEV-PEPSI-330',
    name: 'Pepsi Cola 330ml',
    unit: 'can',
    imageUrl:
      'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'BEV-WATER-600',
    name: 'Natural Mineral Water 600ml',
    unit: 'bottle',
    imageUrl:
      'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'BEV-GREEN-500',
    name: 'Green Tea Honey Lemon 500ml',
    unit: 'bottle',
    imageUrl:
      'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'BEV-COFFEE-LATTE',
    name: 'Ready To Drink Coffee Latte 240ml',
    unit: 'can',
    imageUrl:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'SNK-CHIPS-BBQ',
    name: 'Potato Chips BBQ 50g',
    unit: 'bag',
    imageUrl:
      'https://images.unsplash.com/photo-1613919113640-25732ec5e61f?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'SNK-SEAWEED-32',
    name: 'Crispy Seaweed Snack 32g',
    unit: 'pack',
    imageUrl:
      'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'SNK-NUTS-140',
    name: 'Roasted Mixed Nuts 140g',
    unit: 'pack',
    imageUrl:
      'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'BRD-WHITE-480',
    name: 'Sandwich Bread White 480g',
    unit: 'loaf',
    imageUrl:
      'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'DRY-INSTANT-55',
    name: 'Instant Noodle Shrimp Flavor 55g',
    unit: 'pack',
    imageUrl:
      'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'DRY-RICE-5KG',
    name: 'Jasmine Rice 5kg',
    unit: 'bag',
    imageUrl:
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'DAI-MILK-UHT-1L',
    name: 'UHT Milk 1L',
    unit: 'box',
    imageUrl:
      'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'DAI-YOGURT-135',
    name: 'Plain Yogurt Cup 135g',
    unit: 'cup',
    imageUrl:
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'FRO-ICECREAM-90',
    name: 'Vanilla Ice Cream Bar 90ml',
    unit: 'piece',
    imageUrl:
      'https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'HYG-TISSUE-4',
    name: 'Facial Tissue 4 Rolls',
    unit: 'pack',
    imageUrl:
      'https://images.unsplash.com/photo-1583947581924-860bda6a26df?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'HYG-SHAMPOO-450',
    name: 'Daily Care Shampoo 450ml',
    unit: 'bottle',
    imageUrl:
      'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'BAK-COOKIE-120',
    name: 'Butter Cookies 120g',
    unit: 'box',
    imageUrl:
      'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1000&q=80',
  },
  {
    sku: 'BAK-CAKE-BANANA',
    name: 'Banana Cake Slice',
    unit: 'piece',
    imageUrl:
      'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=1000&q=80',
  },
];

const mockWarehouses = [
  { code: 'WH-MAIN', name: 'Main Warehouse' },
  { code: 'WH-ONLINE', name: 'Online Fulfillment' },
  { code: 'WH-001', name: 'Main Warehouse 001' },
];

const stockBySku = {
  'BEV-COKE-330': { 'WH-MAIN': 220, 'WH-ONLINE': 80 },
  'BEV-PEPSI-330': { 'WH-MAIN': 180, 'WH-ONLINE': 60 },
  'BEV-WATER-600': { 'WH-MAIN': 320, 'WH-ONLINE': 110 },
  'BEV-GREEN-500': { 'WH-MAIN': 140, 'WH-ONLINE': 45 },
  'BEV-COFFEE-LATTE': { 'WH-MAIN': 130, 'WH-ONLINE': 50 },
  'SNK-CHIPS-BBQ': { 'WH-MAIN': 160, 'WH-ONLINE': 70 },
  'SNK-SEAWEED-32': { 'WH-MAIN': 120, 'WH-ONLINE': 55 },
  'SNK-NUTS-140': { 'WH-MAIN': 95, 'WH-ONLINE': 40 },
  'BRD-WHITE-480': { 'WH-MAIN': 65, 'WH-ONLINE': 20 },
  'DRY-INSTANT-55': { 'WH-MAIN': 280, 'WH-ONLINE': 95 },
  'DRY-RICE-5KG': { 'WH-MAIN': 90, 'WH-ONLINE': 30 },
  'DAI-MILK-UHT-1L': { 'WH-MAIN': 115, 'WH-ONLINE': 35 },
  'DAI-YOGURT-135': { 'WH-MAIN': 85, 'WH-ONLINE': 28 },
  'FRO-ICECREAM-90': { 'WH-MAIN': 70, 'WH-ONLINE': 22 },
  'HYG-TISSUE-4': { 'WH-MAIN': 75, 'WH-ONLINE': 26 },
  'HYG-SHAMPOO-450': { 'WH-MAIN': 68, 'WH-ONLINE': 24 },
  'BAK-COOKIE-120': { 'WH-MAIN': 88, 'WH-ONLINE': 33 },
  'BAK-CAKE-BANANA': { 'WH-MAIN': 52, 'WH-ONLINE': 18 },
};

const priceBySku = {
  'BEV-COKE-330': 20,
  'BEV-PEPSI-330': 20,
  'BEV-WATER-600': 12,
  'BEV-GREEN-500': 18,
  'BEV-COFFEE-LATTE': 25,
  'SNK-CHIPS-BBQ': 22,
  'SNK-SEAWEED-32': 28,
  'SNK-NUTS-140': 45,
  'BRD-WHITE-480': 39,
  'DRY-INSTANT-55': 8,
  'DRY-RICE-5KG': 220,
  'DAI-MILK-UHT-1L': 49,
  'DAI-YOGURT-135': 18,
  'FRO-ICECREAM-90': 20,
  'HYG-TISSUE-4': 65,
  'HYG-SHAMPOO-450': 129,
  'BAK-COOKIE-120': 59,
  'BAK-CAKE-BANANA': 35,
};

async function seed() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${productsTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'pcs',
        image_url TEXT NULL,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(
      `ALTER TABLE ${productsTable} ADD COLUMN IF NOT EXISTS image_url TEXT`,
    );
    await client.query(
      `ALTER TABLE ${productsTable} ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${warehousesTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${balancesTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES ${productsTable}(id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES ${warehousesTable}(id) ON DELETE CASCADE,
        quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(product_id, warehouse_id)
      )
    `);

    for (const product of mockProducts) {
      const price = priceBySku[product.sku] ?? 0;
      await client.query(
        `
          INSERT INTO ${productsTable} (sku, name, unit, image_url, price)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (sku) DO UPDATE SET
            name = EXCLUDED.name,
            unit = EXCLUDED.unit,
            image_url = EXCLUDED.image_url,
            price = EXCLUDED.price,
            updated_at = NOW()
        `,
        [product.sku, product.name, product.unit, product.imageUrl, price],
      );
    }

    for (const warehouse of mockWarehouses) {
      await client.query(
        `
          INSERT INTO ${warehousesTable} (code, name)
          VALUES ($1, $2)
          ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = NOW()
        `,
        [warehouse.code, warehouse.name],
      );
    }

    const productsLookupRows = (
      await client.query(`SELECT id, sku FROM ${productsTable}`)
    ).rows;
    const warehousesLookupRows = (
      await client.query(`SELECT id, code FROM ${warehousesTable}`)
    ).rows;
    const productIdBySku = new Map(productsLookupRows.map((row) => [row.sku, row.id]));
    const warehouseIdByCode = new Map(
      warehousesLookupRows.map((row) => [row.code, row.id]),
    );

    for (const productRow of productsLookupRows) {
      const sku = productRow.sku;
      const productId = productRow.id;
      const stocks =
        stockBySku[sku] ??
        ({
          'WH-MAIN': 60,
          'WH-ONLINE': 20,
        });

      for (const [warehouseCode, quantity] of Object.entries(stocks)) {
        const warehouseId = warehouseIdByCode.get(warehouseCode);
        if (!warehouseId) {
          continue;
        }

        await client.query(
          `
            INSERT INTO ${balancesTable} (product_id, warehouse_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              updated_at = NOW()
          `,
          [productId, warehouseId, quantity],
        );
      }
    }

    const warehouseMainId = warehouseIdByCode.get('WH-MAIN');
    const warehouse001Id = warehouseIdByCode.get('WH-001');
    if (warehouseMainId && warehouse001Id) {
      await client.query(
        `
          INSERT INTO ${balancesTable} (product_id, warehouse_id, quantity)
          SELECT product_id, $1, quantity
          FROM ${balancesTable}
          WHERE warehouse_id = $2
          ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            updated_at = NOW()
        `,
        [warehouse001Id, warehouseMainId],
      );
    }

    const { rows } = await client.query(
      `
        SELECT
          p.sku,
          p.name,
          p.unit,
          p.image_url,
          p.price,
          w.code AS warehouse_code,
          b.quantity
        FROM ${productsTable} p
        LEFT JOIN ${balancesTable} b ON b.product_id = p.id
        LEFT JOIN ${warehousesTable} w ON w.id = b.warehouse_id
        ORDER BY p.sku ASC, w.code ASC
      `,
    );

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await client.end();
  }
}

void seed();

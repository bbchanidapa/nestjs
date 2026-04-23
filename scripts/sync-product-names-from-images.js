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

const productsTable = `"${schema}"."inventory_products"`;

function toTitleCase(text) {
  return text
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeFromUnsplashUrl(url) {
  const queryPart = url.split('?')[1] || '';
  const decoded = decodeURIComponent(queryPart)
    .replace(/\+/g, ' ')
    .replace(/\bproduct packaging\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!decoded) {
    return null;
  }

  return toTitleCase(decoded)
    .replace(/\bBbq\b/g, 'BBQ')
    .replace(/\bKg\b/g, 'kg')
    .replace(/\bMl\b/g, 'ml')
    .replace(/\bG\b/g, 'g')
    .replace(/\bL\b/g, 'L')
    .replace(/\bUht\b/g, 'UHT');
}

function normalizeFromWikimediaUrl(url) {
  const lower = url.toLowerCase();
  if (lower.includes('coca-cola')) {
    return 'Coca-Cola 330ml Can';
  }
  if (lower.includes('pepsi')) {
    return 'Pepsi 330ml Can';
  }
  if (lower.includes('banana_cake')) {
    return 'Banana Cake Slice';
  }
  if (lower.includes('water') || lower.includes('kavalan')) {
    return 'Natural Mineral Water 600ml';
  }

  return null;
}

function deriveNameFromImageUrl(imageUrl, currentName) {
  if (typeof imageUrl !== 'string' || imageUrl.trim() === '') {
    return currentName;
  }

  if (imageUrl.includes('source.unsplash.com')) {
    return normalizeFromUnsplashUrl(imageUrl) || currentName;
  }

  if (imageUrl.includes('upload.wikimedia.org')) {
    return normalizeFromWikimediaUrl(imageUrl) || currentName;
  }

  return currentName;
}

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, sku, name, image_url FROM ${productsTable} ORDER BY sku ASC`,
    );

    let updatedCount = 0;
    const preview = [];

    for (const row of rows) {
      const nextName = deriveNameFromImageUrl(row.image_url, row.name);
      if (!nextName || nextName === row.name) {
        continue;
      }

      await client.query(
        `UPDATE ${productsTable} SET name = $1, updated_at = NOW() WHERE id = $2`,
        [nextName, row.id],
      );

      updatedCount += 1;
      if (preview.length < 12) {
        preview.push({
          sku: row.sku,
          before: row.name,
          after: nextName,
        });
      }
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ updatedCount, preview }, null, 2));
  } finally {
    await client.end();
  }
}

void run();

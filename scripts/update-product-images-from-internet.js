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

function sanitizeQuery(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokens(query) {
  return query.split(' ').filter((token) => token.length >= 3);
}

function isLikelyProductImage(url, title, tokens) {
  if (!url) {
    return false;
  }

  const normalizedUrl = url.toLowerCase();
  const normalizedTitle = (title || '').toLowerCase();

  if (normalizedUrl.includes('.pdf') || normalizedTitle.includes('.pdf')) {
    return false;
  }

  const hasImageExtension =
    normalizedUrl.includes('.jpg') ||
    normalizedUrl.includes('.jpeg') ||
    normalizedUrl.includes('.png') ||
    normalizedUrl.includes('.webp');
  if (!hasImageExtension) {
    return false;
  }

  const matchedTokens = tokens.filter(
    (token) => normalizedTitle.includes(token) || normalizedUrl.includes(token),
  );

  return matchedTokens.length >= 1;
}

function buildFallbackImageUrl(query) {
  return `https://source.unsplash.com/1200x1200/?${encodeURIComponent(query + ' product packaging')}`;
}

async function fetchImageByName(productName) {
  const query = sanitizeQuery(productName);
  if (!query) {
    return null;
  }
  const tokens = toTokens(query);

  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', '5');
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url');
  url.searchParams.set('iiurlwidth', '1000');
  url.searchParams.set('iiurlheight', '1000');

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const pages =
    payload &&
    typeof payload === 'object' &&
    'query' in payload &&
    payload.query &&
    typeof payload.query === 'object' &&
    'pages' in payload.query &&
    payload.query.pages &&
    typeof payload.query.pages === 'object'
      ? Object.values(payload.query.pages)
      : [];

  for (const page of pages) {
    if (
      !page ||
      typeof page !== 'object' ||
      !('imageinfo' in page) ||
      !Array.isArray(page.imageinfo)
    ) {
      continue;
    }

    const info = page.imageinfo[0];
    if (!info || typeof info !== 'object') {
      continue;
    }

    const thumbUrl =
      'thumburl' in info && typeof info.thumburl === 'string'
        ? info.thumburl
        : null;
    const directUrl = 'url' in info && typeof info.url === 'string' ? info.url : null;
    const selected = thumbUrl || directUrl;
    const title =
      'title' in page && typeof page.title === 'string' ? page.title : '';
    if (isLikelyProductImage(selected, title, tokens)) {
      return selected;
    }
  }

  return buildFallbackImageUrl(query);
}

async function updateImages() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT id, sku, name FROM ${productsTable} ORDER BY created_at ASC`,
    );

    let updatedCount = 0;
    const updatedRows = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const imageUrl = await fetchImageByName(row.name);
      await client.query(
        `UPDATE ${productsTable}
         SET image_url = $1, updated_at = NOW()
         WHERE id = $2`,
        [imageUrl, row.id],
      );
      updatedCount += 1;
      updatedRows.push({
        sku: row.sku,
        name: row.name,
        image_url: imageUrl,
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          updatedCount,
          preview: updatedRows.slice(0, 10),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

void updateImages();

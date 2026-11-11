const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const sharp = createRequire(require.resolve('next'))('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const component = await fs.readFile(path.join(root, 'components/materials/MaterialsCarousel.tsx'), 'utf8');
  const names = [...component.matchAll(/image: "([^"]+)"/g)].map(match => match[1]);
  const output = path.join(root, 'public/materials-covers');
  await fs.mkdir(output, { recursive: true });
  let originalBytes = 0;
  const totals = { 260: 0, 520: 0, 780: 0 };
  for (const name of names) {
    const original = path.join(root, 'public', `${name}.webp`);
    const bytes = await fs.readFile(original);
    originalBytes += bytes.length;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const row = { image: name, originalBytes: bytes.length };
    for (const width of [260, 520, 780]) {
      const info = await sharp(bytes).resize({ width, withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 }).toFile(path.join(output, `${name}-${width}.webp`));
      totals[width] += info.size;
      row[width] = info.size;
    }
    if (hash !== createHash('sha256').update(await fs.readFile(original)).digest('hex')) {
      throw new Error(`Original changed: ${name}`);
    }
    console.log(JSON.stringify(row));
  }
  console.log(JSON.stringify({ images: names.length, originalBytes, totals, originalsUnchanged: true }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

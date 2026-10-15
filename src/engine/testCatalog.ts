import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type CatalogJson, parseCatalog } from './catalog';

export function loadTestCatalog() {
  const path = fileURLToPath(new URL('../../public/data/stars.json', import.meta.url));
  return parseCatalog(JSON.parse(readFileSync(path, 'utf8')) as CatalogJson);
}

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cityPages = [
  { id: 'krayot-ata',    name: 'קרית-אתא',    file: 'דף-מידע-קרית-אתא.pdf' },
  { id: 'krayot-bialik', name: 'קרית-ביאליק', file: 'דף-מידע-קרית-ביאליק.pdf' },
  { id: 'krayot-yam',    name: 'קרית-ים',     file: 'דף-מידע-קרית-ים.pdf' },
];

const htmlPath = path.join(__dirname, 'דף-מידע-ביקור-שר.html');
const fileUrl = 'file:///' + htmlPath.split('\\').join('/');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

for (const { id, name, file } of cityPages) {
  const page = await browser.newPage();
  // A4 width at 96dpi = 794px; set generous viewport
  await page.setViewport({ width: 794, height: 1123 });

  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });

  // Reset layout so the single city page fills the A4 page edge-to-edge
  await page.evaluate((pageId) => {
    // Hide nav
    const nav = document.querySelector('.nav-bar');
    if (nav) nav.remove();
    document.body.style.cssText = 'margin:0;padding:0;background:white;';

    // Hide other pages; keep target page at its natural 210mm width (= A4 width at 96dpi)
    document.querySelectorAll('.page').forEach(el => {
      if (el.id === pageId) {
        el.style.margin = '0 auto';
        el.style.padding = '0';
        el.style.boxShadow = 'none';
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
  }, id);

  const outPath = path.join(__dirname, file);

  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });

  await page.close();
  console.log(`✓ ${name} → ${file}`);
}

await browser.close();
console.log('Done!');

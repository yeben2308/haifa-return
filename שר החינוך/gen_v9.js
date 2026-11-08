const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--no-sandbox','--disable-gpu','--force-device-scale-factor=2']
  });
  const page = await browser.newPage();
  const url = 'file:///C:/Temp/pres_v8.html';
  await page.goto(url, {waitUntil:'load', timeout:30000});
  await new Promise(r=>setTimeout(r,5000));
  await page.pdf({
    path:'C:/Temp/pres_v9.pdf',
    width:'297mm', height:'210mm',
    printBackground:true,
    margin:{top:'0mm',right:'0mm',bottom:'0mm',left:'0mm'}
  });
  console.log('Done');
  await browser.close();
})().catch(e=>{ console.error('ERROR:',e.message); process.exit(1); });
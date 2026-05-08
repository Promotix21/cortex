import puppeteer from 'puppeteer';

const ASSETS = '/home/rajthecypher/webXExpert-projects/enterprise/apps/cortex/assets';
const APP = 'http://localhost:1420';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
    defaultViewport: { width: 1440, height: 900 },
    protocolTimeout: 30000,
  });

  const page = await browser.newPage();

  console.log('Loading app...');
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // Wait for React to render and sidecar to connect
  await wait(8000);

  // Click Cortex project in the sidebar
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cortex = btns.find(b => b.textContent?.toLowerCase().includes('cortex'));
    if (cortex) cortex.click();
  });
  await wait(3000);

  // 1. Dashboard
  console.log('1. Capturing dashboard...');
  await page.screenshot({ path: `${ASSETS}/dashboard.png` });
  console.log('   saved dashboard.png');

  // 2. Brain — click 6th activity button (index 5)
  console.log('2. Capturing brain...');
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const acts = buttons.filter(b => {
      const r = b.getBoundingClientRect();
      return r.x < 60 && r.width < 61 && r.height > 40;
    });
    if (acts[5]) acts[5].click();
  });
  await wait(3000);
  await page.screenshot({ path: `${ASSETS}/brain.png` });
  console.log('   saved brain.png');

  // 3. Sessions grid — click 2nd activity button (index 1)
  console.log('3. Capturing sessions...');
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const acts = buttons.filter(b => {
      const r = b.getBoundingClientRect();
      return r.x < 60 && r.width < 61 && r.height > 40;
    });
    if (acts[1]) acts[1].click();
  });
  await wait(3000);
  await page.screenshot({ path: `${ASSETS}/sessions.png` });
  console.log('   saved sessions.png');

  // 4. Settings — last activity button
  console.log('4. Capturing settings...');
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const acts = buttons.filter(b => {
      const r = b.getBoundingClientRect();
      return r.x < 60 && r.width < 61 && r.height > 40;
    });
    if (acts.length > 0) acts[acts.length - 1].click();
  });
  await wait(3000);
  await page.screenshot({ path: `${ASSETS}/settings.png` });
  console.log('   saved settings.png');

  // 5. Command palette — go to dashboard first, then Ctrl+K
  console.log('5. Capturing command palette...');
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const acts = buttons.filter(b => {
      const r = b.getBoundingClientRect();
      return r.x < 60 && r.width < 61 && r.height > 40;
    });
    if (acts[0]) acts[0].click();
  });
  await wait(2000);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await wait(1000);
  await page.keyboard.type('session', { delay: 60 });
  await wait(2000);
  await page.screenshot({ path: `${ASSETS}/command-palette.png` });
  console.log('   saved command-palette.png');

  await browser.close();
  console.log('\nDone — all screenshots saved to assets/');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

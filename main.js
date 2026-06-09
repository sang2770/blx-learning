const UndetectableBrowser = require("undetected-browser");
const puppeteer = require("puppeteer");

async function init() {
  const UndetectableBMS = new UndetectableBrowser(
    await puppeteer.launch({ headless: false }),
  );
  const browser = await UndetectableBMS.getBrowser();
  const page = await browser.newPage();
}
init();

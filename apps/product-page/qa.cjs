const assert = require('node:assert/strict');
const { connect } = require('../../tests/cdp.js');

(async () => {
  const browser = await connect();
  try {
    await browser.send('Page.navigate', { url: process.env.RELAY_PRODUCT_URL || 'http://127.0.0.1:4174/' });
    await browser.waitFor("!!document.querySelector('#role-panel .phone')");
    // CDP coordinates must be measured after scrollIntoView has settled.
    const click = async selector => {
      await browser.run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
      await browser.pause(100);
      await browser.click(selector);
    };
    for (const width of [1440, 1024, 768, 390, 360]) {
      await browser.viewport(width, 1000);
      assert.equal(await browser.run('document.documentElement.scrollWidth <= innerWidth'), true, `Overflow at ${width}`);
      assert.equal(await browser.run("[...document.querySelectorAll('a[href^=\"#\"]')].every(a => a.hash === '' || a.hash === '#' || document.getElementById(a.hash.slice(1)))"), true, 'All anchor destinations exist');
      await browser.screenshot(`product-page-${width}`);
    }
    await browser.viewport(390, 844);
    await click('.menu-toggle');
    assert.equal(await browser.run("document.querySelector('.menu-toggle').getAttribute('aria-expanded')"), 'true');
    await browser.key('Escape');
    assert.equal(await browser.run("document.querySelector('.menu-toggle').getAttribute('aria-expanded')"), 'false');
    for (const [index, name] of ['Dispatcher', 'Loader', 'Driver', 'Store'].entries()) {
      await click(`[data-role="${index}"]`);
      assert.equal(await browser.run(`document.querySelector('[data-role="${index}"]').getAttribute('aria-selected')`), 'true');
      assert.ok(await browser.run(`document.querySelector('.role-copy .eyebrow').textContent.includes('${name.toUpperCase()}')`));
      assert.equal(await browser.run('document.documentElement.scrollWidth <= innerWidth'), true, `${name} mobile overflow`);
    }
    await browser.key('Home');
    assert.equal(await browser.run("document.activeElement.id"), 'tab-dispatch');
    await browser.key('ArrowRight');
    assert.equal(await browser.run("document.activeElement.id"), 'tab-loader');
    await browser.key('End');
    assert.equal(await browser.run("document.activeElement.id"), 'tab-store');
    await click('summary');
    assert.equal(await browser.run("document.querySelector('details').open"), true);
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await browser.run("getComputedStyle(document.documentElement).scrollBehavior"), 'auto');
    const copy = await browser.run('document.body.innerText');
    assert.doesNotMatch(copy, /hackathon|designathon|datathon|waypoint|rootcode|triathlon|prototype|lorem ipsum|SOC 2|99\.9%|forecasting|offline synchronization/i);
    assert.deepEqual(browser.errors, []);
    await browser.viewport(1440, 1050);
    await browser.screenshot('product-page-desktop-viewport', false);
    await browser.viewport(390, 844);
    await browser.screenshot('product-page-mobile-viewport', false);
    console.log('Product page passed: five viewport widths, four role tabs, keyboard controls, mobile menu, FAQ, anchors, reduced motion and runtime checks.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

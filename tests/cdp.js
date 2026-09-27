const fs = require('node:fs');
const path = require('node:path');

/** Small dependency-free Chrome DevTools client for the local prototype. */
async function connect() {
  const endpoint = process.env.RELAY_CDP_URL || 'http://127.0.0.1:9222';
  const response = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw Error('Start a separate Chrome browser with --remote-debugging-port=9222.');
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let serial = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(message.id);
        message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result);
      }
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      errors.push(detail.exception?.description || detail.text);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(`Chrome timed out: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
      throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (expression, description = expression) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if (await run(expression)) return; } catch { /* Navigation may replace the execution context. */ }
      await pause(50);
    }
    throw Error(`Timed out waiting for ${description}`);
  };
  const click = async selector => {
    const point = await run(`(() => {
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.getClientRects().length);
      if (!element) throw Error('Visible element missing: ' + ${JSON.stringify(selector)});
      if (element.disabled) throw Error('Control is disabled: ' + ${JSON.stringify(selector)});
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const input = (selector, value, event = 'input') => run(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw Error('Input missing: ' + ${JSON.stringify(selector)});
    element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
  })()`);
  const key = async (key, modifiers = 0) => {
    const codes = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35 };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: codes[key], modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: codes[key], modifiers });
  };
  const viewport = async (width, height = width < 500 ? 844 : 1050) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await pause(120);
  };
  const screenshot = async (name, fullPage = true) => {
    const directory = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(directory, { recursive: true });
    await run("document.querySelector('#toast')?.classList.remove('show'); window.scrollTo(0, 0)");
    await pause(240);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage });
    const filename = path.join(directory, `${name}.png`);
    fs.writeFileSync(filename, Buffer.from(data, 'base64'));
    return filename;
  };
  const navigate = async (hash = '') => {
    await send('Page.navigate', { url: `${process.env.RELAY_URL || 'http://127.0.0.1:4173'}/${hash}` });
    await waitFor("typeof render === 'function' && document.querySelector('#main')", 'Relay to render');
    await run('document.fonts.ready.then(() => true)');
  };
  const close = async () => {
    socket.close();
    await fetch(`${endpoint}/json/close/${target.id}`);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { send, run, waitFor, pause, click, input, key, viewport, screenshot, navigate, errors, close };
}

module.exports = { connect };

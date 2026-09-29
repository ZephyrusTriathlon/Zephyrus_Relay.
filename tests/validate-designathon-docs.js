const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { connect } = require('./cdp');

const docs = [
  ['case_study.html', 8, 0],
  ['design_doc.html', 8, 4],
  ['personas.html', 4, 0],
  ['screen_flows.html', 13, 5],
  ['degradation_screen.html', 4, 1]
];

async function main() {
  const browser = await connect();
  const { send, run, waitFor, viewport, pause } = browser;
  const root = path.resolve(__dirname, '../docs/designathon');
  const previews = path.resolve(__dirname, '../artifacts/document-previews');
  fs.mkdirSync(previews, { recursive: true });

  try {
    await viewport(1100, 1200);
    for (const [filename, expectedPages, previewIndex] of docs) {
      const url = pathToFileURL(path.join(root, filename)).href;
      await send('Page.navigate', { url });
      await waitFor("document.readyState==='complete'", `${filename} to load`);
      await run('document.fonts.ready.then(()=>true)');

      const report = await run(`(() => {
        const pages=[...document.querySelectorAll('.page')];
        const images=[...document.images].map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}));
        const pageOverflow=pages.map((page,index)=>{
          const footer=page.querySelector('.page-footer');
          const content=[...page.children].filter(child=>child!==footer);
          const maxBottom=Math.max(...content.map(child=>child.getBoundingClientRect().bottom));
          return {index:index+1,overflow:maxBottom>(footer?.getBoundingClientRect().top||Infinity)+1,scrollWidth:page.scrollWidth,clientWidth:page.clientWidth};
        });
        return {title:document.title,pages:pages.length,images,rootOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,pageOverflow};
      })()`);

      if (report.pages !== expectedPages) throw new Error(`${filename}: expected ${expectedPages} HTML pages, found ${report.pages}`);
      if (report.rootOverflow) throw new Error(`${filename}: horizontal overflow`);
      const broken = report.images.filter(image => !image.complete || !image.width || !image.height);
      if (broken.length) throw new Error(`${filename}: broken images ${broken.map(image => image.src).join(', ')}`);
      const overflow = report.pageOverflow.filter(page => page.overflow || page.scrollWidth > page.clientWidth + 1);
      if (overflow.length) throw new Error(`${filename}: page overflow ${JSON.stringify(overflow)}`);

      await send('Emulation.setEmulatedMedia', { media: 'print' });
      const printHeights = await run(`(() => [...document.querySelectorAll('.page')].map((page,index)=>{
        const rect=page.getBoundingClientRect();
        const footer=page.querySelector('.page-footer')?.getBoundingClientRect();
        const content=[...page.children].filter(child=>!child.matches('.page-footer'));
        const maxBottom=Math.max(...content.map(child=>child.getBoundingClientRect().bottom));
        return {page:index+1,height:Math.round(rect.height),content:Math.round(maxBottom-rect.top),footer:Math.round((footer?.top||rect.bottom)-rect.top),scrollHeight:page.scrollHeight};
      }))()`);
      const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      const bytes = Buffer.from(pdf.data, 'base64');
      const pdfText = bytes.toString('latin1');
      const printedPages = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
      const counts = [...pdfText.matchAll(/\/Count\s+(\d+)/g)].map(match=>Number(match[1]));
      if (printedPages !== expectedPages) {
        const extracted=spawnSync('C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe',['-','-'],{input:bytes,encoding:'utf8'}).stdout||'';
        const pageText=extracted.split('\f').filter((_,index,array)=>index<array.length-1).map((text,index)=>`${index+1}:${text.replace(/\s+/g,' ').trim().slice(0,90)}`);
        spawnSync('C:\\Program Files\\gs\\gs10.06.0\\bin\\gswin64c.exe',['-dSAFER','-dBATCH','-dNOPAUSE','-sDEVICE=png16m','-r100',`-sOutputFile=${path.join(previews,filename.replace('.html','-print-%02d.png'))}`,'-'],{input:bytes});
        throw new Error(`${filename}: expected ${expectedPages} printed pages, found ${printedPages}; counts ${JSON.stringify(counts)}; text ${JSON.stringify(pageText)}; layout ${JSON.stringify(printHeights)}`);
      }

      await send('Emulation.setEmulatedMedia', { media: 'screen' });
      await run(`document.querySelectorAll('.page')[${previewIndex}].scrollIntoView({block:'start'});`);
      await pause(180);
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
      fs.writeFileSync(path.join(previews, filename.replace('.html', '.png')), Buffer.from(data, 'base64'));
      process.stdout.write(`${filename}: ${expectedPages} pages, ${report.images.length} images, print OK\n`);
    }
    if (browser.errors.length) throw new Error(`Runtime errors: ${browser.errors.join('\n')}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

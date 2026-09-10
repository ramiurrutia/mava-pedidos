import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
const out=await mkdtemp(join(tmpdir(),'mava-pdf-'));
const task=getDocument({data:new Uint8Array(await readFile('C:/Users/Urrutia/Downloads/Pedido _ MAVA Cuadros Sol.pdf')),isEvalSupported:false});
const pdf=await task.promise;
for(let i=1;i<=pdf.numPages;i++){
 const page=await pdf.getPage(i), viewport=page.getViewport({scale:1.5}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
 await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
 const path=join(out,`page-${i}.png`);await writeFile(path,canvas.toBuffer('image/png'));console.log(path);
 const ops=await page.getOperatorList();let matrix=[1,0,0,1,0,0],stack=[];
 const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
 for(let j=0;j<ops.fnArray.length;j++){const fn=ops.fnArray[j],args=ops.argsArray[j];if(fn===OPS.save)stack.push([...matrix]);else if(fn===OPS.restore)matrix=stack.pop()??matrix;else if(fn===OPS.transform)matrix=multiply(matrix,args);else if(fn===OPS.paintImageXObject||fn===OPS.paintInlineImageXObject)console.log(JSON.stringify({page:i,image:args[0],matrix}));}
}
await task.destroy();

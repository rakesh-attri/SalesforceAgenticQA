import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync,strToU8 } from 'fflate';
import { ingestSpec } from '../src/specs/ingest.js';
function pdf() {
  const stream='BT /F1 12 Tf 50 750 Td (ID: pdf-spec) Tj 0 -20 Td (AC1: Explicit outcome) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let content='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(content));content+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(content);
  content+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return content;
}
test('JSON, YAML, Markdown, text, DOCX and PDF ingestion use actual parsers',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sfqa-formats-'));
  try {
    const story={id:'json-spec',title:'Explicit requirement',description:'Fixture',acceptanceCriteria:[{id:'AC1',text:'Explicit outcome',expectedText:'Paid'}],objects:[]};
    await writeFile(join(root,'s.json'),JSON.stringify(story));assert.equal((await ingestSpec(join(root,'s.json'))).acceptanceCriteria[0].expectedText,'Paid');
    await writeFile(join(root,'s.yaml'),'id: yaml-spec\ntitle: Requirement\ndescription: Fixture\nacceptanceCriteria:\n  - id: AC1\n    text: Explicit outcome\n');assert.equal((await ingestSpec(join(root,'s.yaml'))).id,'yaml-spec');
    for(const ext of ['md','txt']){await writeFile(join(root,`s.${ext}`),'ID: text-spec\nAC1: Explicit outcome');assert.equal((await ingestSpec(join(root,`s.${ext}`))).acceptanceCriteria.length,1);}
    const document=zipSync({'[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ID: docx-spec</w:t></w:r></w:p><w:p><w:r><w:t>AC1: Explicit outcome</w:t></w:r></w:p></w:body></w:document>')});
    await writeFile(join(root,'s.docx'),document);assert.equal((await ingestSpec(join(root,'s.docx'))).id,'docx-spec');
    await writeFile(join(root,'s.pdf'),pdf());assert.equal((await ingestSpec(join(root,'s.pdf'))).id,'pdf-spec');
  }finally{await rm(root,{recursive:true,force:true});}
});

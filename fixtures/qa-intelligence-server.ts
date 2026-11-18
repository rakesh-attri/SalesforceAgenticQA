import { createServer } from 'node:http';
import { once } from 'node:events';
export const qaFixtureRecord = '001000000000001';
export const qaFixtureContact = '003000000000001';
// Pure synthetic preview rules, never a Salesforce transport or record factory.
export const qaCases = [{ id: 'AC1', object: 'Account', input: { Name: 'Synthetic QA Account' }, text: 'Draft ready' }, { id: 'AC2', object: 'Contact', input: { LastName: '' }, text: 'Surname required' }, { id: 'AC3', object: 'Contact', input: { LastName: 'A'.repeat(80) }, text: 'Length accepted' }, { id: 'AC4', object: 'Contact', input: { LastName: 'Synthetic Contact', AccountId: qaFixtureRecord }, text: 'Synthetic QA Account' }, { id: 'AC5', object: 'Contact', input: { LastName: 'Synthetic Contact' }, text: 'Insufficient access' }, { id: 'AC6', object: 'Contact', input: { LastName: 'Synthetic Contact' }, text: 'Known rule restored' }, { id: 'AC7', object: 'Contact', input: { LastName: 'Synthetic Contact' }, text: 'Layout approved' }];
export async function startQAIntelligenceFixture(options:{inputs?:(id:string)=>Record<string,unknown>;api?:(id:string,query:string)=>unknown;html?:(id:string,html:string)=>string}={}) {
    const requests: {
        reads: number;
        mutations: number;
    } = { reads: 0, mutations: 0 }, server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (req.method !== 'GET') {
            requests.mutations++;
            res.writeHead(405).end();
            return;
        }
        const id = url.pathname.split('/').at(-1)??'';
        if(url.pathname.startsWith('/api/')&&options.api){requests.reads++;try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(options.api(id,url.searchParams.get('q')??'')));}catch{res.writeHead(403).end();}return;}
        const base=qaCases.find(c=>c.id===id),c=base?{...base,input:options.inputs?.(id)??base.input}:undefined;
        if (!c) {
            res.writeHead(404).end();
            return;
        }
        requests.reads++;
        if (url.pathname.startsWith('/api/')) {
            const rowId = c.object === 'Account' ? qaFixtureRecord : qaFixtureContact, query = url.searchParams.get('q');
            if (query !== `SELECT Id${c.id === 'AC2' ? '' : ',' + (c.object === 'Account' ? 'Name' : c.id === 'AC4' ? 'AccountId' : 'LastName')} FROM ${c.object} WHERE Id='${rowId}' LIMIT 1`) {
                res.writeHead(403).end();
                return;
            }
            res.setHeader('Content-Type', 'application/json');
            // API validation implemented separately from the page's preview logic.
            if (!c.input.LastName && c.object === 'Contact') {
                res.end(JSON.stringify({ errorCode: 'REQUIRED_FIELD_MISSING' }));
                return;
            }
            if (c.id === 'AC5') {
                res.end(JSON.stringify({ errorCode: 'INSUFFICIENT_ACCESS' }));
                return;
            }
            res.end(JSON.stringify({ records: [{ Id: rowId, ...c.input }] }));
            return;
        }
        if (!url.pathname.startsWith('/cases/')) {
            res.writeHead(404).end();
            return;
        }
        res.setHeader('Content-Type', 'text/html');
        const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic QA preview</title><style>body{font:16px Arial;margin:0;background:#f5f7fb}main{margin:40px;width:600px;padding:24px;background:white;border:1px solid #aaa}#clock{position:absolute;top:8px;left:700px;width:180px;height:25px}button{padding:8px}label{display:block;margin:12px}input{width:240px}</style><div id="clock">09:00:00</div><main data-testid="card"><h1>${c.object} synthetic preview</h1><label>Draft name<input data-testid="draft-name" value="${c.object === 'Account' ? c.input.Name : c.input.LastName}"></label><button data-testid="preview">Review draft</button><div data-testid="status" role="status">Not reviewed</div><div role="tablist"><button role="tab">Related</button><button role="tab">Details</button></div></main><script>
 const caseId=${JSON.stringify(c.id)},input=document.querySelector('input'),status=document.querySelector('[role=status]');document.querySelector('[data-testid=preview]').onclick=()=>{const name=input.value;if(caseId==='AC5')status.textContent='Insufficient access';else if(!name.trim())status.textContent='Surname required';else if(caseId==='AC1')status.textContent='Draft ready';else if(caseId==='AC3')status.textContent=name.length===80?'Length accepted':'Length rejected';else if(caseId==='AC4')status.textContent='Synthetic QA Account';else if(caseId==='AC6')status.textContent='Known rule restored';else status.textContent='Layout approved';};</script></html>`;res.end(options.html?.(id,html)??html);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
        throw Error('Fixture listener unavailable');
    return { origin: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

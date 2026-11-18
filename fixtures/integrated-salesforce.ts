import { startQAIntelligenceFixture, qaCases, qaFixtureRecord, qaFixtureContact } from './qa-intelligence-server.js';
import { authorize, type Mutation, type Approval } from '../src/salesforce/approval.js';
import { fingerprint } from '../src/execution/browser-policy.js';
export const integratedIdentity = { Id: '00D000000000001', IsSandbox: true, userId: '005000000000001', persona: 'QA' };
type Row = {
    Id: string;
    object: string;
    runId: string;
    values: Record<string, unknown>;
};
export async function integratedSalesforceFixture() {
    const foreign: Row = { Id: '001000000000999', object: 'Account', runId: 'foreign-unowned', values: { Name: 'Unrelated synthetic sentinel' } }, records = new Map([[foreign.Id, foreign]]), events: Array<{
        operation: string;
        object: string;
        runId: string;
        id: string;
    }> = [];
    let runId = '', planned: {
        Account: Record<string, unknown>;
        Contact: Record<string, unknown>;
    } = { Account: { Name: 'Synthetic QA Account' }, Contact: { LastName: 'Synthetic Contact', AccountId: qaFixtureRecord } }, fault: 'none' | 'api' | 'locator' | 'visual' | 'all' = 'none';
    const inputs = (id: string) => { const c = qaCases.find(c => c.id === id)!; return id === 'AC2' || id === 'AC3' ? { ...c.input } : c.object === 'Account' ? planned.Account : planned.Contact; };
    const query = (text: string) => { const match = /^SELECT ([A-Za-z0-9_,]+) FROM (Account|Contact) WHERE Id='([A-Za-z0-9]{15})' LIMIT 1$/.exec(text); if (!match)
        throw Error('Only reviewed exact-ID SOQL is supported'); const [, projection, object, id] = match, row = records.get(id), fields = projection.split(','); if (fields.some(f => !['Id', ...(object === 'Account' ? ['Name'] : ['LastName', 'AccountId'])].includes(f)))
        throw Error('Unknown query field'); if (row && (row.runId !== runId || row.object !== object))
        throw Error('Foreign fixture record denied'); return { records: row ? [Object.fromEntries(fields.map(f => [f, f === 'Id' ? row.Id : row.values[f]]))] : [] }; };
    const server = await startQAIntelligenceFixture({ inputs, api: (id, text) => { if (id === 'identity' && text === 'identity')
            return integratedIdentity; const result = query(text); if (id === 'verify')
            return result; if (!qaCases.some(c => c.id === id) || result.records.length !== 1)
            throw Error('Case requires a current run-owned record'); if (id === 'AC2' && !inputs(id).LastName)
            return { errorCode: 'REQUIRED_FIELD_MISSING' }; if (id === 'AC5')
            return { errorCode: 'INSUFFICIENT_ACCESS' }; if (id === 'AC1' && (fault === 'api' || fault === 'all'))
            return { records: result.records.map(row => ({ ...row, Name: 'Incorrect independent mock API outcome' })) }; return result; }, html: (id, html) => { if (id === 'AC6' && (fault === 'locator' || fault === 'all'))
            html = html.replaceAll('data-testid="preview"', 'data-testid="current-preview"').replaceAll('[data-testid=preview]', '[data-testid=current-preview]'); if (id === 'AC7' && (fault === 'visual' || fault === 'all'))
            html = html.replace('main{margin:40px', 'main{margin:95px'); return html; } });
    const read = async (text: string, id = 'verify') => { const response = await fetch(`${server.origin}/api/${id}?q=${encodeURIComponent(text)}`, { redirect: 'error', signal: AbortSignal.timeout(3000) }); if (!response.ok)
        throw Error('Independent fixture read denied'); return response.json() as Promise<{
        records?: Record<string, unknown>[];
        errorCode?: string;
    }>; };
    return { ...server, identity: () => ({ ...integratedIdentity }), inputs, read, events, query,
        begin(id: string, values: typeof planned) { if ([...records.values()].some(r => r.runId !== 'foreign-unowned'))
            throw Error('Prior fixture records remain'); runId = id; planned = values; fault = 'none'; }, setFault(value: typeof fault) { fault = value; },
        async mutate(m: Mutation, a: Approval) { authorize(m, a, integratedIdentity, ['Account', 'Contact']); if (m.runId !== runId)
            throw Error('Wrong fixture ownership run'); const id = m.operation === 'create' ? (m.object === 'Account' ? qaFixtureRecord : qaFixtureContact) : m.id!; if (m.operation === 'create') {
            if (records.has(id))
                throw Error('Duplicate active synthetic ID');
            if (m.object === 'Contact' && m.values.AccountId !== qaFixtureRecord)
                throw Error('Parent relationship missing');
            records.set(id, { Id: id, object: m.object, runId: m.runId, values: { ...m.values } });
        }
        else {
            const row = records.get(id);
            if (!row || row.runId !== m.runId || row.object !== m.object)
                throw Error('Foreign cleanup denied');
            if (m.object === 'Account' && [...records.values()].some(r => r.values.AccountId === id))
                throw Error('Dependent Contact remains');
            records.delete(id);
        } events.push({ operation: m.operation, object: m.object, runId: m.runId, id }); return m.operation === 'create' ? { id, success: true } : undefined; },
        async verify(m: Mutation, id: string) { const result = await read(`SELECT Id,${Object.keys(m.values).join(',')} FROM ${m.object} WHERE Id='${id}' LIMIT 1`), row = result.records?.[0]; if (!row || Object.entries(m.values).some(([k, v]) => row[k] !== v))
            throw Error('Independent factory verification mismatch'); return { verified: true, sourceHash: fingerprint(result), runId: m.runId }; },
        state() { return { activeOwned: [...records.values()].filter(r => r.runId !== 'foreign-unowned').length, foreignUnchanged: fingerprint(records.get(foreign.Id)) === fingerprint(foreign), events: [...events], browserMutations: server.requests.mutations }; }
    };
}

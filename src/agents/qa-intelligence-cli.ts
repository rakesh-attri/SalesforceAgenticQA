import { z } from 'zod';
import { localJson } from './workflow-cli.js';
import { SpecSchema } from '../specs/ingest.js';
import { History } from '../core/history.js';
import { KnowledgeIndex } from '../knowledge/index.js';
import { WorkflowModelStore, validateJourney } from './workflow-models.js';
import { fingerprint } from '../execution/browser-policy.js';
import { designQAIntelligence, writeQAIntelligenceReport } from './qa-intelligence.js';
// Local-only planning: no source review, browser reservation, auth, embedding
// client or approval activation can be requested through this closed input.
export async function runQAIntelligence(path: string) {
    const Hash = z.string().regex(/^[a-f0-9]{64}$/), input = z.object({ spec: z.string(), org: z.string(), graph: z.string(), permission: z.string().min(1), model: z.string().optional(), changes: z.array(z.string()).max(1000).default([]), checks: z.object({ oracles: z.array(Hash).max(20), permissions: z.array(Hash).max(20), visuals: z.array(Hash).max(10) }).strict().default({ oracles: [], permissions: [], visuals: [] }) }).strict().parse(await localJson(path)), h = new History();
    try {
        const [spec, org, graph] = await Promise.all([localJson(input.spec).then(v => SpecSchema.parse(v)), localJson(input.org), localJson(input.graph)]);
        let model;
        if (input.model) {
            const requested = validateJourney(await localJson(input.model));
            model = new WorkflowModelStore(h).get(requested.scope, requested.id, requested.version);
            if (fingerprint(model) !== fingerprint(requested))
                throw Error('Model differs from recorded exact review');
        }
        const result = await designQAIntelligence({ ...input, spec, org, graph, model }, { history: h, index: new KnowledgeIndex(h) }, { ...input.checks, permissionEvidence: {} }), files = await writeQAIntelligenceReport(result, [], `.state/qa-intelligence-local-${fingerprint(input).slice(0, 16)}`);
        return { ...files, validation: 'cached-source-only-no-runtime-proof', scenarios: result.coverage.length, declarations: result.declarations.length, reviewQuestions: result.questions.length, proposals: result.coverage.filter(c => c.proposal).length, externalRequests: 0, salesforceRequests: 0, executionAuthorized: false, learningPublished: false };
    }
    finally {
        h.close();
    }
}

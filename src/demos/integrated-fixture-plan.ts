import { qaIntelligenceFixture } from './qa-intelligence-fixture.js';
import { ingestSpec } from '../specs/ingest.js';
import { discoverOrg } from '../agents/org-discovery.js';
import { IntelligenceSchema } from '../agents/org-intelligence.js';
import { buildComponentGraph } from '../agents/component-graph.js';
import { intelligenceFingerprint } from '../knowledge/intelligence-fingerprint.js';
import { snapshotVersion } from '../knowledge/snapshots.js';
import { acquireMetadataWorkflowEvidence, acquireRequirementWorkflowEvidence, reviewJourneyEvidence } from '../agents/workflow-evidence.js';
import { journeyModelHash } from '../agents/workflow-models.js';
import { oracleVersion, permissionVersion } from '../agents/qa-oracles.js';
import { factoryMutationValues } from '../agents/hybrid-factory.js';
import { RecipeSchema } from '../agents/recipe-registry.js';
import { fingerprint } from '../execution/browser-policy.js';
import { integratedIdentity } from '../../fixtures/integrated-salesforce.js';
import { qaFixtureRecord } from '../../fixtures/qa-intelligence-server.js';
export async function integratedFixturePlan(origin: string, runId: string) {
    const f = await qaIntelligenceFixture(origin), spec = await ingestSpec('fixtures/integrated-account-contact.json');
    const raw = await discoverOrg({ apiVersion: 'v66.0', get: async <T>(path: string) => { const object = f.org.objects.find(o => path.endsWith(`/${o.name}/describe`)); if (!object)
            throw Error('Unknown mocked Describe'); return structuredClone(object) as T; } }, ['Account', 'Contact']);
    const org = { ...raw, orgAlias: f.org.orgAlias, source: 'fixture' as const }, intel = IntelligenceSchema.parse({ orgAlias: org.orgAlias, observedAt: org.observedAt, identity: integratedIdentity, catalogCount: 2, selection: { selected: [], unresolved: [], omitted: [], status: 'proposed' }, snapshot: org, sections: [{ area: 'object-business-metadata', status: 'observed', source: 'fixture:metadata/Contact', detail: 'Reviewed synthetic declaration only', records: [{ metadata: { records: { fullName: 'Contact', validationRules: { fullName: 'SurnameRequired', active: true, errorConditionFormula: 'ISBLANK(LastName)', errorMessage: 'Surname required' } } } }] }], unknowns: ['Mocked discovery is not live Salesforce discovery; declaration does not prove runtime validation.'] });
    intel.snapshot.intelligenceFingerprint = intelligenceFingerprint(intel);
    f.org = intel.snapshot;
    f.graph = buildComponentGraph(intel);
    f.spec = spec;
    const metadata = acquireMetadataWorkflowEvidence(f.org, f.graph, 'QA');
    f.scope = metadata.scope;
    const recipes = ['Account', 'Contact'].map(object => RecipeSchema.parse({ id: `integrated-${object}`, object, version: '1', orgAlias: f.org.orgAlias, sourceVersion: snapshotVersion(f.org), reviewedBy: 'Synthetic Fixture Operator', evidence: [`fixture:reviewed-${object}-recipe`], mode: object === 'Account' ? 'api' : 'business-service', fields: object === 'Account' ? { Name: { kind: 'synthetic', type: 'string' } } : { LastName: { kind: 'synthetic', type: 'string' }, AccountId: { kind: 'parent', object: 'Account' } } }));
    const values = { Account: factoryMutationValues(runId, recipes[0], new Map()), Contact: factoryMutationValues(runId, recipes[1], new Map([['Account', qaFixtureRecord]])) }, requirement = reviewJourneyEvidence(acquireRequirementWorkflowEvidence(spec, f.scope), 'Synthetic Fixture Operator');
    for (const c of f.contracts) {
        c.scope = f.scope;
        c.specVersion = spec.version;
        if (c.rule.criterionId === 'AC1' && c.rule.signals[1].channel === 'api')
            c.rule.signals[1].expected = values.Account.Name;
        if (c.rule.criterionId === 'AC3')
            c.rule.signals[1] = { channel: 'api', field: 'AccountId', expected: qaFixtureRecord };
        if (c.rule.criterionId === 'AC6' && c.rule.signals[1].channel === 'api')
            c.rule.signals[1].expected = values.Contact.LastName;
    }
    f.rules.claims.slice(0, f.contracts.length).forEach((claim, i) => { claim.text = JSON.stringify(f.contracts[i].rule); });
    f.rules.version = fingerprint(f.rules.claims);
    Object.assign(f.rules, reviewJourneyEvidence(f.rules, 'Synthetic Fixture Operator'));
    for (const [i, c] of f.contracts.entries()) {
        c.evidence = [{ source: requirement.id, version: requirement.version, claim: spec.acceptanceCriteria.findIndex(a => a.id === c.rule.criterionId) }, { source: f.rules.id, version: f.rules.version, claim: i }];
        c.version = oracleVersion(c);
    }
    f.permission.scope = f.scope;
    f.permission.specVersion = spec.version;
    f.permission.evidence = [{ source: requirement.id, version: requirement.version, claim: 4 }, { source: f.rules.id, version: f.rules.version, claim: f.contracts.length }];
    f.permission.version = permissionVersion(f.permission);
    f.model.scope = f.scope;
    f.model.specVersion = spec.version;
    f.model.sources = [...metadata.sources.map(s => reviewJourneyEvidence(s, 'Synthetic Fixture Operator')), ...f.model.sources.filter(s => s.kind !== 'metadata' && s.kind !== 'requirement' && s.id !== f.rules.id), requirement, f.rules];
    for (const step of f.model.steps)
        for (const outcome of step.outcomes)
            outcome.evidence = { source: requirement.id, claim: spec.acceptanceCriteria.findIndex(a => a.id === outcome.criterionId) };
    f.model.version = journeyModelHash(f.model);
    f.model.review = { reviewer: 'Synthetic Fixture Operator', hash: f.model.version };
    f.context = { spec, org: f.org, graph: f.graph, sources: f.model.sources };
    return { ...f, recipes, values, intelligence: intel };
}

import { IntelligenceSchema } from './org-intelligence.js';
import { metadataRecords } from './component-graph.js';
import { intelligenceFingerprint } from '../knowledge/intelligence-fingerprint.js';
import { digest } from '../execution/browser-policy.js';
import { calculateGrant } from './deep-discovery.js';
import { PermissionContractSchema, type PermissionEvidence } from './qa-oracles.js';
// Explicit declarations only. Missing grants, partial inventories and unknown
// muting/assignments never establish denial or effective record access.
export function permissionEvidenceFromMetadata(raw: unknown, contract: unknown, userHash: string): PermissionEvidence {
    return permissionDimension(raw, contract, userHash, false);
}
function permissionDimension(raw: unknown, contract: unknown, userHash: string, objectOnly: boolean): PermissionEvidence {
    const intel = IntelligenceSchema.parse(raw), c = PermissionContractSchema.parse(contract);
    if (digest(intel.identity.Id) !== c.scope.org || digest(intel.identity.userId) !== userHash || intelligenceFingerprint(intel) !== c.scope.metadataVersion || intel.snapshot.intelligenceFingerprint !== c.scope.metadataVersion)
        throw Error('Permission metadata org/user/version differs');
    const sections = (area: string) => intel.sections.filter(s => s.area === area && ['observed', 'partial'].includes(s.status)), rows = (area: string) => sections(area).flatMap(s => s.records), sources = [...new Set(intel.sections.filter(s => /permission|persona|sharing/.test(s.area)).map(s => s.source))], profileId = rows('persona-profile')[0]?.ProfileId, sets = rows('permission-sets'), profileSets = sets.filter(s => s.ProfileId === profileId && s.IsOwnedByProfile === true).map(s => String(s.Id)), assignments = rows('persona-assignments'), direct = assignments.filter(a => !a.PermissionSetGroupId && typeof a.PermissionSetId === 'string').map(a => String(a.PermissionSetId)), objectKey = { read: 'PermissionsRead', create: 'PermissionsCreate', edit: 'PermissionsEdit', delete: 'PermissionsDelete' }[c.rule.operation], fieldKey = c.rule.operation === 'read' ? 'PermissionsRead' : c.rule.operation === 'edit' || c.rule.operation === 'create' ? 'PermissionsEdit' : undefined;
    const field = objectOnly ? undefined : c.rule.field;
    const grant = (set: string) => { const table = rows(field ? 'field-permissions' : 'object-permissions'), match = table.find(r => r.ParentId === set && r.SobjectType === c.rule.object && (!field || r.Field === c.rule.object + '.' + field)), key = field ? fieldKey : objectKey; return match && key && typeof match[key] === 'boolean' ? match[key] as boolean : undefined; };
    let complete = sections('persona-assignments').length > 0 && sections('persona-profile').length > 0 && intel.sections.filter(s => /permission|persona/.test(s.area)).every(s => s.status === 'observed');
    const groups = [...new Set(assignments.filter(a => typeof a.PermissionSetGroupId === 'string').map(a => String(a.PermissionSetGroupId)))].map(id => {
        const group = rows('permission-set-groups').find(g => g.Id === id), members = rows('permission-group-components').filter(r => r.PermissionSetGroupId === id).map(r => String(r.PermissionSetId)), meta = rows('permission-group-metadata').flatMap(metadataRecords).find(r => r.fullName === group?.DeveloperName), muting = meta?.mutingPermissionSets === undefined ? undefined : Array.isArray(meta.mutingPermissionSets) ? meta.mutingPermissionSets : [meta.mutingPermissionSets];
        let known = !!group && group.Status === 'Updated' && members.length > 0 && !!meta && !!muting, muted = false;
        for (const name of muting ?? []) {
            const mute = rows('muting-permission-sets').flatMap(metadataRecords).find(r => r.fullName === name);
            if (!mute) {
                known = false;
                continue;
            }
            const entries = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []) as Record<string, unknown>[], entry = entries(field ? mute.fieldPermissions : mute.objectPermissions).find(r => field ? r.field === `${c.rule.object}.${field}` : r.object === c.rule.object), key = field ? (c.rule.operation === 'read' ? 'readable' : 'editable') : { read: 'allowRead', create: 'allowCreate', edit: 'allowEdit', delete: 'allowDelete' }[c.rule.operation];
            if (entry?.[key] === true)
                muted = true;
        }
        const values = members.map(m => grant(m));
        if (values.some(v => v === undefined))
            known = false;
        return { grants: values.filter((v): v is boolean => v !== undefined), muted, complete: known };
    });
    const profile = profileSets.map(id => grant(id)), permissionSets = direct.map(id => grant(id));
    if (!profileSets.length || [...profile, ...permissionSets].some(v => v === undefined))
        complete = false;
    const objectEvidence = field ? permissionDimension(raw, contract, userHash, true) : undefined, objectGrant = objectEvidence ? calculateGrant([...objectEvidence.profile, ...objectEvidence.permissionSets], objectEvidence.groups, objectEvidence.complete).candidateGrant : undefined;
    return { profile: profile.filter((v): v is boolean => v !== undefined), permissionSets: permissionSets.filter((v): v is boolean => v !== undefined), groups, complete, objectGrant, sharing: sections('sharing-constraints').length ? 'declared' : 'missing', sources };
}

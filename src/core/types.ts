import { z } from 'zod';
export const StorySchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/), title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.object({ id: z.string(), text: z.string().min(1) })).min(1),
  objects: z.array(z.string()).default([]),
  persona: z.string().optional(),
});
export type Story = z.infer<typeof StorySchema>;
export const ObjectSchema = z.object({
  name: z.string(), label: z.string(), createable: z.boolean(),
  fields: z.array(z.object({ name: z.string(), type: z.string(), nillable: z.boolean(), createable: z.boolean(), defaultedOnCreate: z.boolean().optional(), referenceTo: z.array(z.string()).optional(), picklistValues: z.array(z.string()).optional(),relationshipName:z.string().nullable().optional(),relationshipOrder:z.number().nullable().optional(),restrictedPicklist:z.boolean().optional(),length:z.number().optional(),precision:z.number().optional(),scale:z.number().optional(),updateable:z.boolean().optional() })),
  recordTypeInfos:z.array(z.object({recordTypeId:z.string(),name:z.string(),developerName:z.string().optional(),active:z.boolean().optional(),available:z.boolean().optional(),master:z.boolean().optional(),defaultRecordTypeMapping:z.boolean().optional()})).optional(),
  childRelationships:z.array(z.object({childSObject:z.string(),field:z.string(),relationshipName:z.string().nullable(),cascadeDelete:z.boolean().optional(),restrictedDelete:z.boolean().optional()})).optional(),
});
export const OrgSnapshotSchema = z.object({
  orgAlias: z.string(), observedAt: z.string(), source: z.enum(['fixture','salesforce-api']),
  objects: z.array(ObjectSchema),
  coverage: z.array(z.object({ area:z.string(), status:z.enum(['observed','unknown','blocked']), source:z.string(), detail:z.string() })).optional(),
});
export type OrgSnapshot = z.infer<typeof OrgSnapshotSchema>;
export const TestPlanSchema=z.object({storyId:z.string().min(1),status:z.literal('draft'),scenarios:z.array(z.object({id:z.string().min(1),title:z.string().min(1),expected:z.string().min(1),evidence:z.array(z.string().min(1)).min(1)})),warnings:z.array(z.string())});
export type TestPlan = z.infer<typeof TestPlanSchema>;
export type DataStep = { object: string; operation: 'create'; requiredFields: string[]; dependsOn: string[]; mode: 'api'|'business-service'|'ui'; status: 'proposed'|'blocked'; reason?: string };
export type DataPlan = { storyId: string; steps: DataStep[]; warnings: string[]; approved: false };
export const DataPlanSchema=z.object({storyId:z.string().min(1),steps:z.array(z.object({object:z.string().min(1),operation:z.literal('create'),requiredFields:z.array(z.string()),dependsOn:z.array(z.string()),mode:z.enum(['api','business-service','ui']),status:z.enum(['proposed','blocked']),reason:z.string().optional()})),warnings:z.array(z.string()),approved:z.literal(false)});

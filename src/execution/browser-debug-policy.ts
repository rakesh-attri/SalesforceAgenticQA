import {z} from 'zod';
import {LocatorSchema} from '../core/locators.js';

// Part of the signed browser plan; an environment flag cannot enable capture.
export const BrowserDebugPolicySchema=z.object({
  permission:z.literal('approved-masked-local-only'),
  maxCaptures:z.number().int().min(1).max(12),
  maxTotalBytes:z.number().int().min(1024).max(16777216),
  maxCaptureMs:z.number().int().min(200).max(3000),
  milestonesMs:z.array(z.number().int().min(0).max(30000)).max(4),
  maskLocators:z.array(LocatorSchema.extend({value:z.string().min(1).max(200),name:z.string().max(300).optional()}).strict()).max(20),
  residualSensitiveContentAcknowledged:z.literal(true),
}).strict().refine(p=>new Set(p.milestonesMs).size===p.milestonesMs.length&&p.milestonesMs.every((n,i)=>i===0||n>p.milestonesMs[i-1]),'Milestones must be distinct and increasing');
export type BrowserDebugPolicy=z.infer<typeof BrowserDebugPolicySchema>;

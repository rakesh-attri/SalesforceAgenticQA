import type { z } from 'zod';
// Provider-neutral contract. Model results are data, never tool/approval authority.
export interface StructuredChat {generate<T>(input:{system:string;prompt:string;schema:z.ZodType<T>}):Promise<T>}

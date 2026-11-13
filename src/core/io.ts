import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function loadJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')); }
export async function saveJson(path: string, data: unknown) { await mkdir(dirname(path), {recursive:true}); await writeFile(path, JSON.stringify(data,null,2)+'\n'); }

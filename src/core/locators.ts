import {z} from 'zod';
import type {Page} from '@playwright/test';
export const LocatorSchema=z.object({by:z.enum(['role','label','testId','text']),value:z.string().min(1),name:z.string().optional()});
export type ReviewedLocator=z.infer<typeof LocatorSchema>;
export function resolveLocator(page:Page,locator:ReviewedLocator){
  return locator.by==='role'?page.getByRole(locator.value as 'button',{name:locator.name??'',exact:true}):locator.by==='label'?page.getByLabel(locator.value,{exact:true}):locator.by==='text'?page.getByText(locator.value,{exact:true}):page.getByTestId(locator.value);
}
export function locatorSource(locator:ReviewedLocator){
  const q=JSON.stringify;
  return locator.by==='role'?`page.getByRole(${q(locator.value)} as any, { name: ${q(locator.name??'')}, exact: true })`:locator.by==='label'?`page.getByLabel(${q(locator.value)}, { exact: true })`:locator.by==='text'?`page.getByText(${q(locator.value)}, { exact: true })`:`page.getByTestId(${q(locator.value)})`;
}

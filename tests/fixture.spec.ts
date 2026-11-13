import { test, expect } from '@playwright/test';
test('local demo: payment action changes status',async({page})=>{
  await page.goto('http://127.0.0.1:8765');
  await expect(page.getByTestId('status')).toHaveText('Unpaid');
  await page.getByRole('button',{name:'Pay Now'}).click();
  await expect(page.getByTestId('status')).toHaveText('Paid');
});
test('local demo: declined flow does not mark paid',async({page})=>{
  await page.goto('http://127.0.0.1:8765');
  await page.getByRole('button',{name:'Decline'}).click();
  await expect(page.getByTestId('status')).toHaveText('Declined');
});

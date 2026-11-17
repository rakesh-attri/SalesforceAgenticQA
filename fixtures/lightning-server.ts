import { createServer } from 'node:http';
// Synthetic DOM only: no Salesforce proxy, business records, financial operations or external service calls.
export function lightningFixture() {return createServer((req,res)=>{
  if(req.url==='/s/contacts'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Synthetic Contact workspace</title><h1>Contact workspace</h1><div role="tab">Related</div><div role="tab">Details</div><section role="region" aria-label="Related Accounts">Synthetic related-list structure only</section><div data-testid="contact-status">Contact workspace</div>');return;}
  if(!['/lightning/o/Account','/s/accounts'].includes(req.url??'')){res.writeHead(404);res.end();return;}
  res.setHeader('content-type','text/html');res.end(`<!doctype html><title>Synthetic ${req.url?.startsWith('/s/')?'Experience':'Lightning'} fixture</title><h1>Synthetic account draft</h1><div role="tab">Related</div><div role="tab">Details</div><section role="region" aria-label="Related Contacts"><a href="/s/contacts">View contacts</a></section><qa-account-form></qa-account-form><script>
customElements.define('qa-account-form',class extends HTMLElement{connectedCallback(){const root=this.attachShadow({mode:'open'});root.innerHTML='<label>Account name<input aria-label="Account name"></label><button>Review draft</button><div data-testid="draft-status">Name required</div>';root.querySelector('button').onclick=()=>{root.querySelector('[data-testid="draft-status"]').textContent=root.querySelector('input').value.trim()?'Draft ready':'Name required';};}});
</script>`);
});}

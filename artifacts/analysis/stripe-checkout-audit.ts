import Stripe from 'stripe'
if(!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')&&!process.env.STRIPE_SECRET_KEY?.startsWith('rk_live_'))throw Error('No live key available')
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY)
const start=Math.floor(Date.parse('2026-10-03T21:57:47Z')/1000)
const rows:Stripe.Checkout.Session[]=[]
for await(const s of stripe.checkout.sessions.list({created:{gte:start},limit:100})){if(s.metadata?.source==='web_analysis'||['evaluation','evaluation_pack_3','mobile_subscription_monthly','mobile_subscription_weekly','mobile_subscription_yearly'].includes(s.metadata?.product??''))rows.push(s)}
const groups=new Map<string,any>()
for(const s of rows){const k=[s.metadata?.source,s.metadata?.product,s.status,s.payment_status,s.currency].join('|');const g=groups.get(k)??{source:s.metadata?.source,product:s.metadata?.product,status:s.status,payment_status:s.payment_status,currency:s.currency,sessions:0,amount:0,accounts:new Set()};g.sessions++;g.amount+=(s.amount_total??0)/100;g.accounts.add(s.metadata?.accountId||s.client_reference_id||s.id);groups.set(k,g)}
console.log(JSON.stringify({sessions:rows.length,groups:[...groups.values()].map(g=>({...g,accounts:g.accounts.size}))},null,2))

import {expect,test} from 'bun:test'
import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'
const require=createRequire(import.meta.url)
// Exercise the installed NextAuth cookie implementation, not a simulated check.
const {state,pkce}=require(join(dirname(require.resolve('next-auth/package.json')),'core/lib/oauth/checks.js'))
function options(maxAge=900){return {provider:{checks:['state','pkce']},jwt:{secret:'isolated-oauth-test-secret'},logger:{debug(){}},cookies:{
 state:{name:'__Secure-next-auth.state',options:{httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge}},
 pkceCodeVerifier:{name:'__Secure-next-auth.pkce.code_verifier',options:{httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge}},
}}}
test('same-browser OAuth recovers encrypted state and PKCE and clears one-use cookies',async()=>{
 const config=options(),cookies:any[]=[],params:any={},checks:any={},clear:any[]=[]
 await state.create(config,cookies,params);await pkce.create(config,cookies,params)
 const jar=Object.fromEntries(cookies.map(cookie=>[cookie.name,cookie.value]))
 await state.use(jar,clear,config,checks);await pkce.use(jar,clear,config,checks)
 expect(checks.state).toBe(params.state)
 expect(checks.code_verifier.length).toBeGreaterThan(40)
 expect(clear.every(cookie=>cookie.options.maxAge===0)).toBe(true)
})
test('switching browser reproduces the exact production state-missing failure; checks remain enforced',async()=>{
 await expect(state.use({},[],options(),{})).rejects.toThrow('State cookie was missing.')
 await expect(pkce.use({},[],options(),{})).rejects.toThrow('PKCE code_verifier cookie was missing.')
})
test('expired or modified cookie cannot become a session',async()=>{
 const config=options(-60),cookies:any[]=[]
 await state.create(config,cookies,{})
 await expect(state.use({[cookies[0].name]:cookies[0].value},[],config,{})).rejects.toThrow()
 await expect(state.use({[cookies[0].name]:cookies[0].value+'x'},[],options(),{})).rejects.toThrow()
})

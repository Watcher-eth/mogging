import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {createHash} from 'node:crypto'
import {createLocalJWKSet,exportJWK,generateKeyPair,jwtVerify,SignJWT} from 'jose'
import {ApiError} from '../api/http'
const pair=await generateKeyPair('RS256'),jwk={...await exportJWK(pair.publicKey),kid:'fixture',alg:'RS256'}
const source=readFileSync(new URL('./mobile-session.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'')
const scope:any={URL,Date,createHash,ApiError,createRemoteJWKSet:()=>createLocalJWKSet({keys:[jwk]}),jwtVerify}
runInNewContext(new Bun.Transpiler({loader:'ts'}).transformSync(source+'\nglobalThis.verify=verifyAppleIdentity;'),scope)
const token=(claims:Record<string,unknown>={},aud='app.mogging.scan')=>new SignJWT({nonce:createHash('sha256').update('nonce').digest('hex'),email:'buyer@example.test',email_verified:true,...claims}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setSubject('apple-subject').setIssuer('https://appleid.apple.com').setAudience(aud).setExpirationTime('5m').sign(pair.privateKey)
test('signed Apple identity verifies audience and nonce, and trusts only verified email',async()=>{
 expect(await scope.verify(await token(),'nonce')).toMatchObject({subject:'apple-subject',email:'buyer@example.test'})
 expect((await scope.verify(await token({email_verified:'true'}),'nonce')).email).toBe('buyer@example.test')
 expect((await scope.verify(await token({email_verified:false}),'nonce')).email).toBeNull()
 await expect(scope.verify(await token({nonce:'wrong'}),'nonce')).rejects.toThrow('nonce')
 await expect(scope.verify(await token({},'different-app'),'nonce')).rejects.toThrow('invalid or expired')
})

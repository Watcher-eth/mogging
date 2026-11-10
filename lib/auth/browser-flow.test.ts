import {expect,test} from 'bun:test'
import {authReturnPath,isEmbeddedBrowser,oauthProvider} from './browser-flow'
test('recovery remembers only supported providers and keeps the callback on our origin',()=>{
 expect(oauthProvider('tiktok')).toBe('tiktok')
 expect(oauthProvider('https://evil.test')).toBe('google')
 expect(oauthProvider('__proto__')).toBe('google')
 expect(authReturnPath('https://www.mogging.com/creator/setup?welcome=1','https://www.mogging.com')).toBe('/creator/setup?welcome=1')
 for(const input of ['https://evil.test/creator','https://www.mogging.com/auth/error','https://www.mogging.com//evil.test'])expect(authReturnPath(input,'https://www.mogging.com')).toBe('/')
})
test('embedded creator browsers are identified without storing their user agents',()=>{
 for(const agent of ['Instagram 300','TikTok','musical_ly','GSA/123','FBAV/300'])expect(isEmbeddedBrowser(agent)).toBe(true)
 expect(isEmbeddedBrowser('Version/18.0 Mobile Safari/605.1')).toBe(false)
})

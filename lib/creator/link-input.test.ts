import {expect,test} from 'bun:test'
import {creatorLinkInputSchema,normalizeCreatorCode} from './link-input'
test('published creator codes, handles and links resolve to the same exact code',()=>{
  for(const input of ['@Pain.PSL','pain.psl','https://www.mogging.com/r/Pain.PSL?utm_source=tiktok','mogging.com/r/pain.psl','mogging://r/pain.psl']) {
    expect(normalizeCreatorCode(input)).toBe('pain.psl')
    expect(creatorLinkInputSchema.parse({slug:input})).toMatchObject({slug:'pain.psl'})
  }
  expect(normalizeCreatorCode('mogging-pain.psl')).toBe('mogging-pain.psl')
})
test('arbitrary hosts, invite links, credentials, ports and malformed codes are rejected',()=>{
  for(const input of ['https://evil.test/r/pain.psl','https://mogging.com/invite/abc','https://mogging.com.evil.test/r/a','https://user@mogging.com/r/a','https://mogging.com:8080/r/a','../a','']) {
    expect(normalizeCreatorCode(input)).toBeNull()
    expect(creatorLinkInputSchema.safeParse({slug:input}).success).toBe(false)
  }
})

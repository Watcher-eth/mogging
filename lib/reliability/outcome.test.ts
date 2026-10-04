import {describe,expect,test} from 'bun:test'
import {backendOutcome} from './outcome'

describe('backend reliability outcomes',()=>{
  test('notifies for 5xx, never ordinary authentication and validation rejections',()=>{
    expect(backendOutcome(502,null)).toEqual({outcome:'failed',code:'http_502',alert:true})
    for(const status of [400,401,403,409,429]) expect(backendOutcome(status,null).alert).toBe(false)
  })
  test('captures provider failures even when the endpoint returns 201',()=>{
    expect(backendOutcome(201,{data:{analysis:{status:'failed',metrics:{providerError:{code:'provider_unavailable',raw:'secret'}}}}})).toEqual({outcome:'failed',code:'provider_unavailable',alert:true})
    expect(backendOutcome(401,{error:{code:'provider_error'}})).toEqual({outcome:'failed',code:'provider_http_401',alert:true})
  })
  test('invalid photo stays visible without an outage alert',()=>{
    expect(backendOutcome(201,{data:{analysis:{status:'failed',failureReason:'No face detected'}}})).toEqual({outcome:'failed',code:'input_no_face',alert:false})
  })
  test('successful transient report still reports broken persistence',()=>{
    expect(backendOutcome(201,{data:{analysis:{status:'complete',persistenceFailureReason:'Image storage failed'}}})).toEqual({outcome:'degraded',code:'analysis_persistence_failed',alert:true})
  })
  test('raw unknown provider errors cannot become diagnostic codes',()=>{
    expect(backendOutcome(200,{data:{analysis:{status:'failed',metrics:{providerError:{code:'secret-api-key'}}}}}).code).toBe('evaluation_failed')
    expect(backendOutcome(200,{data:{analysis:{status:'complete'}}})).toEqual({outcome:'ok',code:'ok',alert:false})
  })
})

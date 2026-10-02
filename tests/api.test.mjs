import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../src/lib/api.ts';
test('a platform failure gives a readable error, not a JSON parser exception',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('A server error has occurred\nFUNCTION_INVOCATION_FAILED',{status:500,headers:{'content-type':'text/plain'}}));
 await assert.rejects(api('/api/attendees'),{message:'The server is temporarily unavailable. Please try again shortly.'});
});
test('API validation messages are preserved',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'That PIN is incorrect.'},{status:401}));
 await assert.rejects(api('/api/login'),{message:'That PIN is incorrect.'});
});

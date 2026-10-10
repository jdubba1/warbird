import test from 'node:test';
import assert from 'node:assert/strict';
import {startAnalytics} from '../dist/analytics.js';
function harness(hostname='warbird.jimbo.sh'){
  const scripts=[],win={location:{hostname}};
  const doc={querySelector:()=>scripts[0],createElement:()=>({dataset:{}}),head:{append:script=>scripts.push(script)}};
  return {scripts,win,doc};
}
test('production queues URL sanitization before loading one same-origin analytics script',()=>{
  const h=harness();assert.equal(startAnalytics(h.win,h.doc),true);assert.equal(startAnalytics(h.win,h.doc),false);
  assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].src,'/_vercel/insights/script.js');assert.equal(h.scripts[0].defer,true);
  assert.equal(h.win.vaq[0][0],'beforeSend');const sanitize=h.win.vaq[0][1];
  const event={type:'pageview',url:'https://warbird.jimbo.sh/?secret=abc#123',referrer:'https://reddit.com/r/WarDogs/?tracking=xyz'};
  assert.deepEqual(sanitize(event),{type:'pageview',url:'https://warbird.jimbo.sh/',referrer:'https://reddit.com/r/WarDogs/'});
  assert.equal(sanitize({url:'invalid url'}).url,'');
});
test('local, preview and server-side imports never start analytics',()=>{
  for(const host of ['localhost','127.0.0.1','rotor-preview.vercel.app']){const h=harness(host);assert.equal(startAnalytics(h.win,h.doc),false);assert.equal(h.scripts.length,0);assert.equal(h.win.va,undefined);}
  assert.equal(startAnalytics(undefined,undefined),false);
});

// Vercel's same-origin, cookie-free pageview script. No flight telemetry is sent.
// Local development and previews stay out of production visit counts.
export function startAnalytics(win=globalThis.window,doc=globalThis.document){
  if(!win||!doc||win.location?.hostname!=='warbird.jimbo.sh')return false;
  if(doc.querySelector('script[data-warbird-analytics]'))return false;
  win.va=win.va||function(){(win.vaq=win.vaq||[]).push(arguments);};
  // Keep user-supplied query strings out of pageview URLs/referrers.
  win.va('beforeSend',event=>{
    for(const key of ['url','referrer'])if(event[key])try{const url=new URL(event[key]);url.search='';url.hash='';event[key]=url.href;}catch{event[key]='';}
    return event;
  });
  const script=doc.createElement('script');script.src='/_vercel/insights/script.js';script.defer=true;script.dataset.warbirdAnalytics='';doc.head.append(script);return true;
}
startAnalytics();

const crypto=require('crypto');
const {getStore}=require('@netlify/blobs');

const out=(s,b,h={})=>({
  statusCode:s,
  headers:{
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    ...h
  },
  body:JSON.stringify(b)
});

const cookie=(e)=>{
  let c=e.headers.cookie||e.headers.Cookie||'',
      m=c.match(/rf_admin=([^;]+)/);
  return m?decodeURIComponent(m[1]):''
};

const sig=(u)=>crypto
  .createHmac('sha256',process.env.SESSION_SECRET||'')
  .update(u)
  .digest('hex');

const admin=e=>{
  let [u,s]=cookie(e).split('.');
  return !!u&&!!s&&process.env.SESSION_SECRET&&s===sig(u)
};

const clean=s=>String(s||'').replace(/\s+/g,' ').trim();

function seo(t,d,p){
  let w=[...new Set(
    (t+' '+d)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g,' ')
    .split(/\s+/)
    .filter(x=>x.length>3)
  )].slice(0,12);

  let title=clean(t);

  if(p==='Pinterest') title+=' | Ideas & Tips';
  if(p==='LinkedIn') title+=' — Key Insights';
  if(p==='YouTube') title+=' | Complete Guide';

  return {
    platform:p,
    title,
    description:clean(d)+' Learn the key points, practical tips and useful details.',
    keywords:w,
    hashtags:w.slice(0,8).map(x=>'#'+x)
  };
}

async function audit(u){
  if(!/^https?:\/\//i.test(u))
    throw Error('Valid http/https URL required');

  let c=new AbortController(),
      tm=setTimeout(()=>c.abort(),9000),
      r;

  try{
    r=await fetch(u,{
      signal:c.signal,
      headers:{'user-agent':'RankForgeBot/1.0'}
    });
  }finally{
    clearTimeout(tm);
  }

  if(!r.ok)
    throw Error('URL returned HTTP '+r.status);

  let h=await r.text();

  let title=(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';

  let md=(h.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i
  )||[])[1]||'';

  let og=(n)=>
    (h.match(
      new RegExp(
        '<meta[^>]+(?:property|name)=["']'+
        n+
        '["'][^>]+content=["']([^"']*)',
        'i'
      )
    )||[])[1]||'';

  let checks=[
    ['Title',title.length>=20&&title.length<=65],
    ['Meta description',md.length>=70&&md.length<=170],
    ['OG title',!!og('og:title')],
    ['OG description',!!og('og:description')],
    ['OG image',!!og('og:image')],
    ['Content',h.replace(/<[^>]+>/g,' ').length>500]
  ];

  let pass=checks.filter(x=>x[1]).length;

  return {
    score:Math.round(pass/checks.length*100),
    url,
    title,
    description:md,
    checks:checks.map(x=>({
      item:x[0],
      passed:x[1]
    })),
    note:'RankForge heuristic audit; not an official score from any platform.'
  };
}

exports.handler=async e=>{
  if(e.httpMethod==='OPTIONS')
    return out(204,{});

  let b={};

  try{
    b=JSON.parse(e.body||'{}');
  }catch{
    return out(400,{
      ok:false,
      error:'Invalid JSON'
    });
  }

  if(b.action==='login'){
    if(
      b.username===process.env.ADMIN_USER &&
      b.password===process.env.ADMIN_PASS
    ){
      let t=b.username+'.'+sig(b.username);

      return out(
        200,
        {ok:true},
        {
          'Set-Cookie':
            `rf_admin=${encodeURIComponent(t)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
        }
      );
    }

    return out(401,{
      ok:false,
      error:'Invalid admin credentials'
    });
  }

  if(b.action==='logout'){
    return out(
      200,
      {ok:true},
      {
        'Set-Cookie':
          'rf_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
      }
    );
  }

  if(b.action==='generate'){
    if(!b.topic||!b.description){
      return out(400,{
        ok:false,
        error:'Topic and description required'
      });
    }

    return out(200,{
      ok:true,
      result:seo(
        b.topic,
        b.description,
        b.platform||'General'
      )
    });
  }

  if(b.action==='audit'){
    try{
      return out(200,{
        ok:true,
        result:await audit(b.url)
      });
    }catch(x){
      return out(400,{
        ok:false,
        error:x.message
      });
    }
  }

  if(['users','toggle'].includes(b.action)){
    if(!admin(e)){
      return out(401,{
        ok:false,
        error:'Admin authentication required'
      });
    }

    let s=getStore('rankforge-users'),
        u=await s.get('users',{type:'json'})||[];

    if(b.action==='toggle'){
      let i=u.findIndex(
        x=>x.email===String(b.email).toLowerCase()
      );

      if(i<0){
        u.push({
          email:String(b.email).toLowerCase(),
          status:'inactive'
        });
      }else{
        u[i].status=
          u[i].status==='active'
            ?'inactive'
            :'active';
      }

      await s.setJSON('users',u);
    }

    return out(200,{
      ok:true,
      users:u
    });
  }

  return out(404,{
    ok:false,
    error:'Unknown action'
  });
};

async function api(action,data={}){
  let r=await fetch('/.netlify/functions/api',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,...data})
  });
  return await r.json();
}

async function generate(){
  gen.textContent='Generating...';
  let r=await api('generate',{
    topic:topic.value,
    description:description.value,
    platform:platform.value
  });
  gen.textContent=r.ok
    ? JSON.stringify(r.result,null,2)
    : r.error;
}

async function audit(){
  audit.textContent='Checking...';
  score.textContent='';
  let r=await api('audit',{url:url.value});

  if(!r.ok){
    audit.textContent=r.error;
    return;
  }

  score.textContent=r.result.score+'/100';
  audit.textContent=JSON.stringify(r.result,null,2);
}

async function login(){
  let r=await api('login',{
    username:user.value,
    password:pass.value
  });

  if(r.ok){
    login.hidden=true;
    dash.hidden=false;
    users();
  }else{
    alert(r.error);
  }
}

async function users(){
  let r=await api('users');

  if(!r.ok){
    alert(r.error);
    return;
  }

  userlist.innerHTML=r.users.map(u=>`
    <div class="person">
      <b>${u.email}</b> — ${u.status}
      <button onclick="toggle('${encodeURIComponent(u.email)}')">
        ${u.status==='active'?'Deactivate':'Activate'}
      </button>
    </div>
  `).join('') || 'No users';
}

async function toggle(e){
  let r=await api('toggle',{
    email:decodeURIComponent(e)
  });

  if(!r.ok){
    alert(r.error);
  }else{
    users();
  }
}

async function logout(){
  await api('logout');
  dash.hidden=true;
  login.hidden=false;
      }

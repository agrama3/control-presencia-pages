import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const config=window.PRESENCIA_CONFIG||{};
const demo=!config.supabaseUrl || !config.supabaseAnonKey;
const supa=demo?null:createClient(config.supabaseUrl,config.supabaseAnonKey);
const app=document.getElementById('app');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const localTime=x=>new Date(x).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const initial={departments:[{id:'dep-1',name:'Administración',active:true},{id:'dep-2',name:'Mantenimiento',active:true},{id:'dep-3',name:'Seguridad',active:true}],profiles:[{id:'u-1',full_name:'Ana Martínez',email:'ana@ejemplo.es',department_id:'dep-1',role:'employee',active:true},{id:'u-2',full_name:'Carlos Ruiz',email:'carlos@ejemplo.es',department_id:'dep-2',role:'employee',active:true},{id:'u-3',full_name:'Lucía Pérez',email:'lucia@ejemplo.es',department_id:'dep-3',role:'employee',active:true}],attendance:[]};
let memory;
try{memory=JSON.parse(localStorage.getItem('presencia-demo-v1'))||structuredClone(initial)}catch{memory=structuredClone(initial)}
const save=()=>localStorage.setItem('presencia-demo-v1',JSON.stringify(memory));
let role=null,profile=null,departments=[],profiles=[],attendance=[],tab='overview',day=today(),filter='all',modal=null,authMode='employee',notice='',busy=false,checkinBusy=false,authScreen='login',recoveryReady=false;
const adminStorageKey='presencia-demo-admin-v1';
const getAdminCredential=()=>{try{return JSON.parse(localStorage.getItem(adminStorageKey))}catch{return null}};
const storeAdminCredential=c=>localStorage.setItem(adminStorageKey,JSON.stringify(c));
const randomCode=()=>{const a=new Uint8Array(12);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(a);else for(let i=0;i<a.length;i++)a[i]=Math.floor(Math.random()*256);return [...a].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase()};
async function hashSecret(v){if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')}let x=2166136261;for(const c of v){x=Math.imul(x^c.charCodeAt(0),16777619)}return 'demo-'+(x>>>0).toString(16)};
const depName=id=>departments.find(d=>d.id===id)?.name||'Sin asignar';
const header=()=>`<header class="top"><div class="top-inner"><div class="brand"><div class="logo">✓</div><div>Control de presencia<div class="sub">Gestión de personal y dependencias</div></div></div><div class="toolbar">${demo?'<span class="pill-demo">MODO DEMOSTRACIÓN</span>':''}${profile?`<span class="muted small">${esc(profile.full_name)}</span><button class="btn tiny" data-action="logout">Salir</button>`:''}</div></div></header>`;
const shell=html=>app.innerHTML=`<div class="app">${header()}${html}</div>`;
const note=()=>notice?`<div class="notice ${notice.startsWith('Error:')?'error':'success'}">${esc(notice)}</div>`:'';
const setNote=(msg)=>{notice=msg;render();};
async function refresh(){
 if(demo){departments=[...memory.departments];profiles=[...memory.profiles];attendance=[...memory.attendance];profile=role==='employee'?profiles.find(p=>p.id===profile?.id):profile;return;}
 const [d,p,a]=await Promise.all([supa.from('departments').select('*').order('name'),supa.from('profiles').select('*').order('full_name'),supa.from('attendance').select('*').eq('work_date',day)]);
 for(const res of [d,p,a])if(res.error)throw res.error;
 departments=d.data;profiles=p.data;attendance=a.data;
 const current=profiles.find(p=>p.id===profile?.id);if(current)profile=current;
}
async function init(){
 if(demo){render();return;}
 const {data:{session}}=await supa.auth.getSession();
 if(session && !window.location.hash.includes('type=recovery'))await startSession();else render();
 supa.auth.onAuthStateChange(async (event)=>{if(event==='PASSWORD_RECOVERY'){recoveryReady=true;authScreen='new-password';role=null;profile=null;render();}else if(event==='SIGNED_OUT'){role=null;profile=null;render();}});
}
async function startSession(){
 const {data:{user}}=await supa.auth.getUser();if(!user){role=null;profile=null;render();return;}
 const {data:p,error}=await supa.from('profiles').select('*').eq('id',user.id).single();
 if(error || !p?.active){await supa.auth.signOut();throw Error('Cuenta inexistente o desactivada');}
 role=p.role;profile=p;await refresh();render();
}
function loginPage(){
 const adminCred=getAdminCredential();
 let form='';
 if(demo){
  if(authMode==='employee')form=`<form id="demo-login"><div class="field"><label>Seleccionar trabajador de prueba</label><select name="user">${memory.profiles.filter(p=>p.active).map(p=>`<option value="${esc(p.id)}">${esc(p.full_name)} — ${esc(memory.departments.find(d=>d.id===p.department_id)?.name||'Sin dependencia')}</option>`).join('')}</select></div><button class="btn primary wide">Entrar como personal</button></form>`;
  else if(authScreen==='setup' || !adminCred)form=`<form id="demo-admin-setup"><h2>Configurar administrador</h2><p>Establece una contraseña y conserva el código de recuperación. Se guarda solo en este navegador.</p><div class="field"><label>Nueva contraseña</label><input name="password" type="password" autocomplete="new-password" required></div><div class="field"><label>Repetir contraseña</label><input name="confirm" type="password" autocomplete="new-password" required></div><button class="btn primary wide">Crear acceso de administrador</button></form>`;
  else if(authScreen==='showcode')form=`<div class="notice success"><strong>Guarda tu código de recuperación en un lugar seguro.</strong><p class="credentials">${esc(window.demoRecoveryCode||'')}</p>Solo se muestra ahora. Será necesario para recuperar la contraseña en este navegador.</div><button class="btn primary wide" data-action="saved-code">Ya he guardado el código</button>`;
  else if(authScreen==='forgot')form=`<form id="demo-admin-reset"><h2>Recuperar contraseña</h2><div class="field"><label>Código de recuperación</label><input name="code" autocomplete="off" required></div><div class="field"><label>Nueva contraseña</label><input name="password" type="password" required></div><div class="field"><label>Repetir nueva contraseña</label><input name="confirm" type="password" required></div><button class="btn primary wide">Restablecer contraseña</button></form><button class="btn wide" data-action="back-login">Volver al acceso</button>`;
  else form=`<form id="demo-login"><div class="field"><label>Contraseña de administrador</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn primary wide">Acceder como administrador</button></form><button class="btn wide" data-action="forgot">¿Has olvidado la contraseña?</button>`;
 }else{
  if(authScreen==='forgot')form=`<form id="real-forgot"><p>Introduce el correo de la cuenta de administrador. Recibirás un enlace de recuperación si está configurado el servicio de correo en Supabase.</p><div class="field"><label>Correo del administrador</label><input name="email" type="email" autocomplete="email" required></div><button class="btn primary wide">Enviar enlace de recuperación</button></form><button class="btn wide" data-action="back-login">Volver al acceso</button>`;
  else if(authScreen==='new-password')form=`<form id="real-new-password"><h2>Establecer nueva contraseña</h2><div class="field"><label>Nueva contraseña</label><input type="password" name="password" autocomplete="new-password" required></div><div class="field"><label>Repetir contraseña</label><input type="password" name="confirm" autocomplete="new-password" required></div><button class="btn primary wide">Guardar contraseña</button></form>`;
  else form=`<form id="real-login"><div class="field"><label>Correo electrónico</label><input name="email" type="email" autocomplete="username" required placeholder="nombre@organizacion.es"></div><div class="field"><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn primary wide" ${busy?'disabled':''}>Acceder</button></form>${authMode==='admin'?'<button class="btn wide" data-action="forgot">¿Has olvidado la contraseña?</button>':''}`;
 }
 const showChoices=authScreen==='login' || (demo&&authScreen==='setup');
 shell(`<main class="auth-wrap"><section class="auth-card"><h1>Accede a tu espacio</h1><p>Selecciona tu tipo de acceso para continuar.</p>${showChoices?`<div class="choices"><button class="choice ${authMode==='employee'?'active':''}" data-action="auth-mode" data-mode="employee">👤<br>Personal</button><button class="choice ${authMode==='admin'?'active':''}" data-action="auth-mode" data-mode="admin">⚙<br>Administrador</button></div>`:''}${demo?'<div class="notice">Versión de demostración: la contraseña y los registros se guardan solo en este navegador. No ofrece seguridad real ni permite recuperación entre dispositivos.</div>':''}${form}${note()}</section></main>`);
}
function adminPage(){
 const people=profiles.filter(p=>p.role==='employee');const records=attendance.filter(a=>a.work_date===day);
 const present=people.filter(p=>p.active&&records.some(a=>a.user_id===p.id)).length, active=people.filter(p=>p.active).length;
 const filtered=people.filter(p=>filter==='all'||p.department_id===filter);
 let content='';
 if(tab==='overview')content=`<div class="grid"><div class="stat"><div class="label">Personal activo</div><div class="number">${active}</div></div><div class="stat"><div class="label">Presencias confirmadas</div><div class="number">${present}</div></div><div class="stat"><div class="label">Pendientes de confirmar</div><div class="number">${active-present}</div></div></div><section class="panel"><div class="panel-header"><div><h2>Estado de presencia</h2><p>Consulta los registros de la fecha seleccionada.</p></div><div class="filterrow"><div class="field"><label>Fecha</label><input type="date" id="day" value="${esc(day)}"></div><div class="field"><label>Dependencia</label><select id="filter"><option value="all">Todas</option>${departments.map(d=>`<option value="${d.id}" ${filter===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div><button class="btn" data-action="csv">Exportar CSV</button></div></div><div class="tablewrap"><table><thead><tr><th>Trabajador</th><th>Dependencia</th><th>Estado</th><th>Hora</th></tr></thead><tbody>${filtered.map(p=>{const a=records.find(a=>a.user_id===p.id);return `<tr><td><strong>${esc(p.full_name)}</strong></td><td>${esc(depName(p.department_id))}</td><td><span class="pill ${!p.active?'':a?'green':'orange'}">${!p.active?'Inactivo':a?'Presente':'Pendiente'}</span></td><td>${a?localTime(a.checked_at):'—'}</td></tr>`}).join('')||'<tr><td colspan="4" class="empty">No hay personas en esta selección</td></tr>'}</tbody></table></div></section>`;
 if(tab==='people')content=`<section class="panel"><div class="panel-header"><div><h2>Personal</h2><p>Alta, edición, asignación a dependencia y desactivación.</p></div><button class="btn primary" data-action="add-person">+ Añadir trabajador</button></div><div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Dependencia</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${people.map(p=>`<tr><td><strong>${esc(p.full_name)}</strong></td><td>${esc(p.email)}</td><td>${esc(depName(p.department_id))}</td><td><span class="pill ${p.active?'green':''}">${p.active?'Activo':'Inactivo'}</span></td><td><div class="row-actions"><button class="btn tiny" data-action="edit-person" data-id="${p.id}">Editar</button>${!demo?`<button class="btn tiny" data-action="password" data-id="${p.id}">Clave</button>`:''}<button class="btn tiny danger" data-action="remove-person" data-id="${p.id}">Eliminar</button></div></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Aún no hay trabajadores</td></tr>'}</tbody></table></div></section>`;
 if(tab==='departments')content=`<section class="panel"><div class="panel-header"><div><h2>Dependencias</h2><p>Crea y modifica las dependencias de la organización.</p></div><button class="btn primary" data-action="add-dept">+ Nueva dependencia</button></div><div class="tablewrap"><table><thead><tr><th>Dependencia</th><th>Trabajadores</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${departments.map(d=>`<tr><td><strong>${esc(d.name)}</strong></td><td>${people.filter(p=>p.department_id===d.id).length}</td><td><span class="pill ${d.active?'green':''}">${d.active?'Activa':'Inactiva'}</span></td><td><div class="row-actions"><button class="btn tiny" data-action="edit-dept" data-id="${d.id}">Editar</button><button class="btn tiny danger" data-action="remove-dept" data-id="${d.id}">Eliminar</button></div></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aún no hay dependencias</td></tr>'}</tbody></table></div></section>`;
 shell(`<main class="shell"><div class="hero"><h1>Panel de administración</h1><p>Gestión de la plantilla y seguimiento diario de presencia.</p></div><nav class="tabs"><button class="tab ${tab==='overview'?'active':''}" data-action="tab" data-tab="overview">Resumen diario</button><button class="tab ${tab==='people'?'active':''}" data-action="tab" data-tab="people">Personal</button><button class="tab ${tab==='departments'?'active':''}" data-action="tab" data-tab="departments">Dependencias</button></nav>${note()}${content}</main>${modal?modalHtml():''}`);
}
function staffPage(){
 const a=attendance.find(a=>a.user_id===profile.id&&a.work_date===today());
 shell(`<main class="shell"><div class="staff-card"><section class="panel"><div class="avatar">✓</div><h1>Hola, ${esc(profile.full_name)}</h1><p class="muted">Confirma tu llegada a tu puesto de trabajo.</p><div class="dept">📍 ${esc(depName(profile.department_id))}</div>${!profile.department_id?'<div class="notice error">No tienes dependencia asignada. Consulta con administración.</div>':''}${a?`<div class="notice success">Presencia confirmada hoy a las <strong>${localTime(a.checked_at)}</strong>.</div>`:''}<button class="check-btn" data-action="checkin" ${a||!profile.department_id||checkinBusy?'disabled':''}>${a?'✓ Presencia registrada':'✓ Confirmar que estoy en mi puesto'}</button><div class="footer-note">${new Date().toLocaleDateString('es-ES',{timeZone:'Europe/Madrid',weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div><div class="footer-note">Solo debes confirmar una vez al día y cuando estés físicamente en tu dependencia.</div>${note()}</section></div></main>`);
}
function modalHtml(){
 const edit=modal.id, dept=modal.type==='dept', pass=modal.type==='password',item=dept?departments.find(d=>d.id===edit):profiles.find(p=>p.id===edit);
 if(pass)return `<div class="modal-bg"><section class="modal"><h2>Cambiar contraseña</h2><form id="modal-form"><div class="field"><label>Nueva contraseña</label><input name="password" required type="text" autocomplete="off"></div><div class="modal-actions"><button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary">Guardar clave</button></div></form></section></div>`;
 return `<div class="modal-bg"><section class="modal"><h2>${edit?'Editar':'Añadir'} ${dept?'dependencia':'trabajador'}</h2><form id="modal-form"><div class="field"><label>${dept?'Nombre de la dependencia':'Nombre y apellidos'}</label><input name="name" required maxlength="100" value="${esc(dept?item?.name:item?.full_name)}" placeholder="${dept?'Ej. Taller de mantenimiento':'Nombre completo'}"></div>${dept?`<div class="field"><label>Estado</label><select name="active"><option value="true" ${item?.active!==false?'selected':''}>Activa</option><option value="false" ${item?.active===false?'selected':''}>Inactiva</option></select></div>`:`${!edit?`<div class="field"><label>Correo electrónico (para acceder)</label><input type="email" required name="email" placeholder="nombre@organizacion.es"></div><div class="field"><label>Contraseña inicial (mín. 10 caracteres)</label><input type="text" required name="password" minlength="10" autocomplete="off"><div class="section-info">Entrega esta clave al trabajador por un canal seguro.</div></div>`:''}<div class="field"><label>Dependencia</label><select name="department_id"><option value="">Sin asignar</option>${departments.filter(d=>d.active||d.id===item?.department_id).map(d=>`<option value="${d.id}" ${item?.department_id===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div>${edit?`<div class="field"><label>Estado</label><select name="active"><option value="true" ${item?.active!==false?'selected':''}>Activo</option><option value="false" ${item?.active===false?'selected':''}>Inactivo</option></select></div>`:''}`}<div class="modal-actions"><button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" ${busy?'disabled':''}>Guardar</button></div></form></section></div>`;
}
function render(){if(!role)loginPage();else if(role==='admin')adminPage();else staffPage();}
async function staffApi(payload){
 if(demo){if(payload.action==='create')memory.profiles.push({id:uid(),role:'employee',full_name:payload.full_name,email:payload.email,department_id:payload.department_id,active:true});
 else if(payload.action==='update')Object.assign(memory.profiles.find(p=>p.id===payload.id),payload);
 else if(payload.action==='delete'){memory.profiles=memory.profiles.filter(p=>p.id!==payload.id);memory.attendance=memory.attendance.filter(a=>a.user_id!==payload.id)}
 save();return;}
 const {data:{session}}=await supa.auth.getSession();
 if(!session?.access_token)throw Error('La sesión ha caducado. Vuelve a acceder.');
 const res=await fetch(`${config.supabaseUrl}/functions/v1/staff`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':config.supabaseAnonKey},body:JSON.stringify(payload)});
 const data=await res.json();if(!res.ok)throw Error(data.error||'Error de servidor');
}
async function click(action,el){
 if(action==='auth-mode'){authMode=el.dataset.mode;authScreen='login';notice='';render();return;}
 if(action==='forgot'){authScreen='forgot';notice='';render();return;}
 if(action==='back-login'){authScreen='login';notice='';render();return;}
 if(action==='saved-code'){window.demoRecoveryCode='';authScreen='login';notice='';render();return;}
 if(action==='logout'){if(!demo)await supa.auth.signOut();role=null;profile=null;notice='';render();return;}
 if(action==='tab'){tab=el.dataset.tab;notice='';render();return;}
 if(action==='close'){modal=null;render();return;}
 if(action==='add-person'){modal={type:'person'};render();return;}
 if(action==='edit-person'){modal={type:'person',id:el.dataset.id};render();return;}
 if(action==='password'){modal={type:'password',id:el.dataset.id};render();return;}
 if(action==='add-dept'){modal={type:'dept'};render();return;}
 if(action==='edit-dept'){modal={type:'dept',id:el.dataset.id};render();return;}
 if(action==='remove-person'){
  if(!confirm('¿Eliminar definitivamente este trabajador y sus registros de presencia?'))return;
  await staffApi({action:'delete',id:el.dataset.id});await refresh();setNote('Trabajador eliminado.');return;
 }
 if(action==='remove-dept'){
  const id=el.dataset.id;if(profiles.some(p=>p.department_id===id)){setNote('Error: Primero reasigna los trabajadores de esta dependencia.');return;}
  if(!confirm('¿Eliminar la dependencia?'))return;
  if(demo){memory.departments=memory.departments.filter(d=>d.id!==id);save();}
  else{const {error}=await supa.from('departments').delete().eq('id',id);if(error)throw error;}
  await refresh();setNote('Dependencia eliminada.');return;
 }
 if(action==='checkin'){
  if(checkinBusy)return;checkinBusy=true;render();try{
   if(demo){const d=today();if(!memory.attendance.find(a=>a.user_id===profile.id&&a.work_date===d))memory.attendance.push({id:uid(),user_id:profile.id,department_id:profile.department_id,work_date:d,checked_at:new Date().toISOString()});save();}
   else{const {error}=await supa.rpc('check_in');if(error)throw error;}
   day=today();await refresh();notice='Presencia registrada correctamente.';
  }finally{checkinBusy=false;render();}return;
 }
 if(action==='csv'){
  const arr=[['Nombre','Correo','Dependencia','Estado','Hora','Fecha'],...profiles.filter(p=>p.role==='employee'&&(filter==='all'||p.department_id===filter)).map(p=>{const a=attendance.find(a=>a.user_id===p.id&&a.work_date===day);return [p.full_name,p.email,depName(p.department_id),!p.active?'Inactivo':a?'Presente':'Pendiente',a?localTime(a.checked_at):'',day]})];
  const csv='\ufeff'+arr.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`presencia-${day}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);return;
 }
}
async function submit(form){
 const d=Object.fromEntries(new FormData(form));
 if(form.id==='demo-admin-setup'){
  if(d.password!==d.confirm)throw Error('Las contraseñas no coinciden.');
  if(getAdminCredential())throw Error('Ya existe un administrador. Utiliza la recuperación.');
  const code=randomCode();storeAdminCredential({passwordHash:await hashSecret(d.password),recoveryHash:await hashSecret(code)});
  window.demoRecoveryCode=code;authScreen='showcode';notice='';render();return;
 }
 if(form.id==='demo-admin-reset'){
  if(d.password!==d.confirm)throw Error('Las contraseñas no coinciden.');
  const cred=getAdminCredential();if(!cred || (await hashSecret(d.code.trim().replaceAll(' ','').toUpperCase()))!==cred.recoveryHash)throw Error('Código de recuperación incorrecto.');
  const code=randomCode();storeAdminCredential({passwordHash:await hashSecret(d.password),recoveryHash:await hashSecret(code)});
  window.demoRecoveryCode=code;authScreen='showcode';notice='Contraseña actualizada. Conserva el nuevo código de recuperación.';render();return;
 }
 if(form.id==='demo-login'){
  if(authMode==='admin'){
   const cred=getAdminCredential();if(!cred || (await hashSecret(d.password))!==cred.passwordHash)throw Error('Contraseña de administrador incorrecta.');
  }
  role=authMode;profile=role==='admin'?{id:'admin-demo',full_name:'Administrador',role:'admin'}:memory.profiles.find(p=>p.id===d.user);day=today();notice='';await refresh();render();return;
 }
 if(form.id==='real-forgot'){
  const {error}=await supa.auth.resetPasswordForEmail(d.email.trim(),{redirectTo:window.location.origin+window.location.pathname});
  if(error)throw error;authScreen='login';notice='Si la cuenta existe y el correo está habilitado, recibirás un enlace para restablecer la contraseña.';render();return;
 }
 if(form.id==='real-new-password'){
  if(!recoveryReady)throw Error('Enlace de recuperación no válido o caducado. Solicita otro.');
  if(d.password!==d.confirm)throw Error('Las contraseñas no coinciden.');
  const {error}=await supa.auth.updateUser({password:d.password});if(error)throw error;
  recoveryReady=false;await supa.auth.signOut();authScreen='login';notice='Contraseña restablecida. Accede con tu nueva contraseña.';render();return;
 }
 if(form.id==='real-login'){
  busy=true;notice='';render();try{const {data,error}=await supa.auth.signInWithPassword({email:d.email.trim(),password:d.password});if(error)throw error;
   await startSession();if(role!==authMode){await supa.auth.signOut();role=null;profile=null;throw Error('Esta cuenta pertenece al otro tipo de acceso.');}
   notice='';}finally{busy=false;render();}return;
 }
 if(form.id==='modal-form'){
  busy=true;try{
   if(modal.type==='dept'){
    const record={name:d.name.trim(),active:d.active==='true'};
    if(demo){if(modal.id)Object.assign(memory.departments.find(x=>x.id===modal.id),record);else memory.departments.push({id:uid(),...record});save();}
    else{const req=modal.id?supa.from('departments').update(record).eq('id',modal.id):supa.from('departments').insert(record);const {error}=await req;if(error)throw error;}
   }else if(modal.type==='password'){await staffApi({action:'reset_password',id:modal.id,password:d.password});}
   else{const payload=modal.id?{action:'update',id:modal.id,full_name:d.name.trim(),department_id:d.department_id||null,active:d.active==='true'}:{action:'create',full_name:d.name.trim(),email:d.email.trim(),password:d.password,department_id:d.department_id||null};await staffApi(payload);}
   modal=null;await refresh();notice='Cambios guardados correctamente.';render();
  }finally{busy=false;}return;
 }
}
app.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;try{await click(el.dataset.action,el)}catch(err){busy=false;setNote('Error: '+err.message)}});
app.addEventListener('submit',async e=>{e.preventDefault();try{await submit(e.target)}catch(err){busy=false;setNote('Error: '+err.message)}});
app.addEventListener('change',async e=>{if(e.target.id==='day'){day=e.target.value;try{await refresh();render()}catch(err){setNote('Error: '+err.message)}}if(e.target.id==='filter'){filter=e.target.value;render()}});
init().catch(err=>{role=null;profile=null;setNote('Error: '+err.message)});

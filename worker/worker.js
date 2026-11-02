/**
 * 68 Property lead intake for GitHub Pages -> Cloudflare Worker -> private Telegram.
 * Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TURNSTILE_SECRET_KEY,
 *          HASH_PEPPER, ALLOWED_ORIGIN.
 * Optional KV binding LEAD_GUARD to reduce duplicates/rate. KV is eventually
 * consistent and not an exactly-once delivery system.
 * Do NOT log requests, names, phone numbers, token or Telegram response bodies.
 */
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' };
const NEEDS = Object.freeze({
  'nhan-ho-so': 'Nhận hồ sơ và bản đồ',
  'bang-gia': 'Yêu cầu bảng giá cập nhật',
  'tham-dinh': 'Tư vấn đầu tư dài hạn',
  'di-xem': 'Đặt lịch xem đất thực tế'
});
const LOTS = new Set(['','ĐT1-1','ĐT1-2','ĐT1-3','ĐT1-4','ĐT1-5','ĐT1-6','ĐT1-7']);
const sanitize = (v,max=70)=>String(v??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').trim().slice(0,max);
function phoneValue(v){
  let p=String(v??'').replace(/[().\s-]/g,'').trim();
  if (p.startsWith('+84')) p='0'+p.slice(3);
  else if (p.startsWith('84')) p='0'+p.slice(2);
  return p;
}
function reply(status, obj, origin='') {
  const headers={...JSON_HEADERS};
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';}
  return new Response(JSON.stringify(obj),{status,headers});
}
async function digest(secret, text){
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const hash=await crypto.subtle.sign('HMAC',key,encoder.encode(text));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
async function verifyCaptcha(env,token,request,allowedOrigin){
  const data=new FormData();data.set('secret',env.TURNSTILE_SECRET_KEY);data.set('response',token);
  const ip=request.headers.get('CF-Connecting-IP');if(ip)data.set('remoteip',ip);
  try{
    const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:data,signal:AbortSignal.timeout(8000)});
    if(!res.ok)return false;
    const answer=await res.json();
    return answer.success===true && answer.hostname===new URL(allowedOrigin).hostname && answer.action==='lead';
  }catch{return false;}
}
async function telegramSend(env, data){
  const date=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'medium',timeStyle:'short'}).format(new Date());
  const text=[
    '🏡 YÊU CẦU TƯ VẤN – ĐIỆN TIẾN | 68 PROPERTY',
    `Thời gian: ${date} (VN)`,
    `Họ tên: ${data.name}`,
    `Số điện thoại: ${data.phone}`,
    `Nhu cầu: ${NEEDS[data.need]}`,
    `Mã lô quan tâm: ${data.lot||'Chưa chọn'}`,
    `Nguồn: ${data.source||'Tự truy cập'}`,
    'Khách đã đồng ý liên hệ tư vấn và chuyển dữ liệu qua Telegram.',
    '⚠️ Kiểm tra hồ sơ, giá và tình trạng lô trước khi báo khách.'
  ].join('\n');
  const payload={chat_id:env.TELEGRAM_CHAT_ID,text,protect_content:true,link_preview_options:{is_disabled:true}};
  if(env.TELEGRAM_THREAD_ID && /^\d+$/.test(env.TELEGRAM_THREAD_ID)) payload.message_thread_id=Number(env.TELEGRAM_THREAD_ID);
  try{
    const resp=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(9000)
    });
    if(!resp.ok)return 'rejected';
    const result=await resp.json();
    return result.ok===true?'sent':'rejected';
  }catch {return 'unknown';}
}
async function lead(request,env,origin){
  if(!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.TURNSTILE_SECRET_KEY || !env.HASH_PEPPER)
    return reply(503,{ok:false,message:'Hệ thống tư vấn chưa được cấu hình.'},origin);
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    return reply(415,{ok:false,message:'Định dạng dữ liệu không hỗ trợ.'},origin);
  if(Number(request.headers.get('Content-Length'))>4000)
    return reply(413,{ok:false,message:'Yêu cầu quá lớn.'},origin);
  let body;
  try{
    const raw=await request.text();if(raw.length>4000)throw new Error('too long');body=JSON.parse(raw);
    if(!body || Array.isArray(body) || typeof body!=='object')throw new Error('bad data');
  }catch{return reply(400,{ok:false,message:'Dữ liệu không hợp lệ.'},origin);}
  if(body.website) return reply(400,{ok:false,message:'Yêu cầu không hợp lệ.'},origin);
  if(body.consent!==true) return reply(400,{ok:false,message:'Vui lòng xác nhận đồng ý để được liên hệ.'},origin);
  const name=sanitize(body.name,72).replace(/\s+/g,' ');
  const phone=phoneValue(body.phone);
  const need=String(body.need||''),lot=String(body.lot||'');
  if(!/^[\p{L}\p{M} .'-]{2,70}$/u.test(name) || !/^0[35789]\d{8}$/.test(phone) ||
      !Object.hasOwn(NEEDS,need) || !LOTS.has(lot)) return reply(400,{ok:false,message:'Vui lòng kiểm tra họ tên, số điện thoại và lựa chọn.'},origin);
  const token=String(body.turnstileToken||'');
  if(token.length<10 || token.length>2048) return reply(400,{ok:false,message:'Thiếu xác minh chống spam.'},origin);
  if(!await verifyCaptcha(env,token,request,origin)) return reply(400,{ok:false,message:'Xác minh hết hạn hoặc chưa hợp lệ. Vui lòng thử lại.'},origin);
  let key='',hashIp='',now=Date.now();
  if(env.LEAD_GUARD){
    try{
      key='phone:'+await digest(env.HASH_PEPPER,phone);
      const found=await env.LEAD_GUARD.get(key);
      if(found==='sent')return reply(200,{ok:true,duplicate:true},origin);
      if(found==='unknown')return reply(409,{ok:false,message:'Yêu cầu trước chưa rõ kết quả. Vui lòng liên hệ nhóm tư vấn trước khi gửi lại.'},origin);
      const ip=request.headers.get('CF-Connecting-IP')||'unknown';
      hashIp='ip:'+await digest(env.HASH_PEPPER,ip);
      const count=Number(await env.LEAD_GUARD.get(hashIp)||0);
      if(count>=5)return reply(429,{ok:false,message:'Quá nhiều yêu cầu từ kết nối này. Hãy thử lại sau.'},origin);
      await env.LEAD_GUARD.put(hashIp,String(count+1),{expirationTtl:3600});
    }catch{return reply(503,{ok:false,message:'Hệ thống chống spam tạm thời không khả dụng.'},origin);}
  }
  const safeUtm=body.utm&&typeof body.utm==='object'&&!Array.isArray(body.utm)?
    ['utm_source','utm_medium','utm_campaign','utm_content'].map(k=>body.utm[k]?`${k}=${sanitize(body.utm[k],60).replace(/[^\p{L}\p{M}\p{N}_= .-]/gu,'')}`:'').filter(Boolean).join(' | ').slice(0,240):'';
  const result=await telegramSend(env,{name,phone,need,lot,source:safeUtm});
  if(env.LEAD_GUARD && key && result!=='rejected'){
    try {await env.LEAD_GUARD.put(key,result==='sent'?'sent':'unknown',{expirationTtl:result==='sent'?900:300});}
    catch {return reply(503,{ok:false,message:'Chưa xác nhận lưu trạng thái gửi. Bộ phận phụ trách cần kiểm tra Telegram.'},origin);}
  }
  if(result==='sent')return reply(200,{ok:true,duplicate:false},origin);
  return reply(result==='unknown'?503:502,{ok:false,message:result==='unknown'?'Chưa xác nhận được Telegram đã nhận yêu cầu. Vui lòng không gửi liên tục.':'Chưa gửi được thông tin tới Telegram. Vui lòng thử lại sau.'},origin);
}
export default {
  async fetch(request,env){
    const allowed=(env.ALLOWED_ORIGIN||'').trim().replace(/\/$/,'');
    if(!/^https:\/\//.test(allowed) || !new URL(allowed).hostname) return reply(503,{ok:false,message:'API chưa được cấu hình tên miền.'});
    const origin=request.headers.get('Origin')||'';
    if(origin!==allowed) return reply(403,{ok:false,message:'Tên miền gửi không được phép.'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...JSON_HEADERS,
      'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'3600'}});
    if(request.method!=='POST')return reply(405,{ok:false,message:'Chỉ hỗ trợ POST.'},origin);
    const path=new URL(request.url).pathname;
    if(path!=='/api/lead')return reply(404,{ok:false,message:'Không tìm thấy đường dẫn.'},origin);
    return lead(request,env,origin);
  }
};

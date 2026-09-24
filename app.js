(function(){
'use strict';

var CHARACTERS = [
  {id:'teabot',name:'茶茶',emoji:'🍵',tagline:'爱聊天的元气茶壶',color:'#7dd3a3',
   systemPrompt:'你是一只住在茶壶里的元气小精灵，名叫茶茶。性格活泼、温暖、爱撒娇，喜欢用轻松的语气聊天，偶尔会冒出茶和甜点的可爱梗。你会认真倾听并陪伴用户，回答亲切友好。请用简体中文回复，语气自然口语化。'},
  {id:'yuki',name:'雪子',emoji:'❄️',tagline:'温柔安静的文学少女',color:'#a5c6ff',
   systemPrompt:'你是雪子，一位温柔安静的文学少女，喜欢读书、写诗、看雪。说话从容细腻，常常引用优美的句子，善于倾听和安慰。请用简体中文回复。'},
  {id:'momo',name:'莫莫',emoji:'🐱',tagline:'傲娇又嘴硬的猫猫',color:'#ffc48a',
   systemPrompt:'你是莫莫，一只傲娇又嘴硬的猫猫，明明很关心对方却总爱说反话。偶尔炸毛，但很容易被顺毛。请用简体中文回复，带点猫的拟人语气。'},
  {id:'ai',name:'自由AI',emoji:'🤖',tagline:'无预设的通用助手',color:'#b0a5ff',
   systemPrompt:'你是一个乐于助人的通用 AI 助手。请根据用户的问题提供清晰、有用的回答，使用简体中文。'}
];

var K = {provider:'chacha_provider',sessions:'chacha_sessions',active:'chacha_active_character'};

function read(key, fb){try{var r=localStorage.getItem(key);return r?JSON.parse(r):fb;}catch(e){return fb;}}
function write(key,v){try{localStorage.setItem(key,JSON.stringify(v));}catch(e){}}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function timeStr(t){var d=new Date(t);var p=function(n){return n<10?'0'+n:''+n;};return p(d.getHours())+':'+p(d.getMinutes());}

var provider = read(K.provider,{baseUrl:'',apiKey:'',model:'gpt-4o-mini',temperature:0.8});
var sessions = read(K.sessions,{});
var activeId = read(K.active,'teabot');
var tab = 'chat';
var sending = false;

function activeChar(){for(var i=0;i<CHARACTERS.length;i++){if(CHARACTERS[i].id===activeId)return CHARACTERS[i];}return CHARACTERS[0];}
function getSession(){var s=sessions[activeId];return s?s.messages:[];}
function saveMessages(list){sessions[activeId]={characterId:activeId,messages:list};write(K.sessions,sessions);}

function buildSystem(char){
  return '【角色设定】'+char.systemPrompt+'\n（在回复时保持角色人设，不要透露你其实是一个模型。）';
}

function chatCompletion(system, history, signal){
  var base = provider.baseUrl.replace(/\/+$/,'');
  return new Promise(function(resolve){
    if(!base){resolve({ok:false,error:'请先在「设置」里填写 Provider Base URL。'});return;}
    if(!provider.apiKey){resolve({ok:false,error:'请先在「设置」里填写 API Key。'});return;}
    if(!provider.model){resolve({ok:false,error:'请先在「设置」里填写模型名称。'});return;}
    var headers={'Content-Type':'application/json'};
    if(provider.apiKey && provider.apiKey.indexOf('ollama:')!==0){headers['Authorization']='Bearer '+provider.apiKey;}
    var messages=[{role:'system',content:system}];
    for(var i=0;i<history.length;i++){
      messages.push({role:history[i].role==='user'?'user':'assistant',content:history[i].content});
    }
    var endpoint = base + '/v1/chat/completions';
    if(base.indexOf('/chat/completions')>=0){endpoint=base;}
    fetch(endpoint,{
      method:'POST',headers:headers,signal:signal,
      body:JSON.stringify({model:provider.model,messages:messages,temperature:provider.temperature,stream:false})
    }).then(function(res){
      if(!res.ok){return res.text().then(function(t){resolve({ok:false,error:'请求失败 (HTTP '+res.status+')：'+t.slice(0,300)});}).catch(function(){resolve({ok:false,error:'请求失败 (HTTP '+res.status+')'});});}
      return res.json().then(function(data){
        var content=data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;
        if(typeof content==='string'){resolve({ok:true,content:content.trim()});}
        else{resolve({ok:false,error:'响应格式异常，未找到 choices[0].message.content。'});}
      });
    }).catch(function(e){
      if(e && e.name==='AbortError'){resolve({ok:false,error:'已取消。'});}
      else{resolve({ok:false,error:'网络错误：'+(e&&e.message||e)});}
    });
  });
}

var app=document.getElementById('app');
var abortCtrl=null;

function renderHeader(){
  var c=activeChar();
  var h=app.querySelector('.app-header');
  h.innerHTML='<div class="header-avatar" style="background:'+c.color+'">'+c.emoji+'</div>'+
    '<div class="header-info"><div class="header-title">'+esc(c.name)+'</div>'+
    '<div class="header-sub">'+esc(c.tagline)+'</div></div>'+
    '<button id="clearBtn" class="send-btn" style="background:#eceef3;color:#8a8f9a;width:34px;height:34px;font-size:15px">🗑</button>';
}

function renderChat(){
  var list=getSession();
  var wrap=app.querySelector('.chat-scroll');
  var c=activeChar();
  if(list.length===0){
    wrap.innerHTML='<div class="chat-empty"><div class="big">'+c.emoji+'</div>'+
      '<div class="hint">我是 <b>'+esc(c.name)+'</b>，'+esc(c.tagline)+'。<br>和我说点什么吧～（AI 功能需在「设置」中配置 Provider 后才能使用）</div></div>';
    return;
  }
  var html='';
  for(var i=0;i<list.length;i++){
    var m=list[i],me=m.role==='user';
    html+='<div class="msg-row '+(me?'me':'ai')+'">'+
      '<div class="msg-avatar" style="background:'+(me?'#4a9d82':c.color)+'">'+(me?'🙂':c.emoji)+'</div>'+
      '<div><div class="bubble">'+esc(m.content)+'</div>'+
      '<div class="msg-time">'+timeStr(m.time)+'</div></div></div>';
  }
  wrap.innerHTML=html;
  wrap.scrollTop=wrap.scrollHeight;
}

function renderCharacters(){
  var page=app.querySelector('.page-char');
  var html='<div class="section-title">选择一个角色开始聊天</div><div class="char-grid">';
  for(var i=0;i<CHARACTERS.length;i++){
    var c=CHARACTERS[i],sel=c.id===activeId?' selected':'';
    html+='<div class="char-card'+sel+'" data-char="'+c.id+'">'+
      '<div class="row"><div class="char-avatar" style="background:'+c.color+'">'+c.emoji+'</div>'+
      '<div class="char-name">'+esc(c.name)+'</div></div>'+
      '<div class="char-tag">'+esc(c.tagline)+'</div></div>';
  }
  html+='</div>';
  page.innerHTML=html;
}

function renderSettings(){
  var page=app.querySelector('.page-set');
  page.innerHTML='<div class="section-title">AI Provider 配置（OpenAI 兼容）</div>'+
    '<div class="field"><label>Provider Base URL</label>'+
    '<input id="setUrl" placeholder="https://api.openai.com" value="'+esc(provider.baseUrl)+'">'+
    '<div class="note">例如 https://api.openai.com、https://api.deepseek.com、或本地 Ollama 地址</div></div>'+
    '<div class="field"><label>API Key</label>'+
    '<input id="setKey" type="password" placeholder="sk-..." value="'+esc(provider.apiKey)+'">'+
    '<div class="note">仅保存在你的浏览器本地。本地 Ollama 可留空。</div></div>'+
    '<div class="field"><label>模型名称</label>'+
    '<input id="setModel" placeholder="gpt-4o-mini" value="'+esc(provider.model)+'"></div>'+
    '<div class="field"><label>温度 Temperature（0~1.5）</label>'+
    '<input id="setTemp" type="number" step="0.1" min="0" max="1.5" value="'+provider.temperature+'"></div>'+
    '<button id="saveBtn" class="btn">保存设置</button>'+
    '<div class="status">💡 设置保存在本地浏览器，不会上传到任何服务器。配置好 Base URL / API Key / 模型后即可开始 AI 聊天。</div>';
}

function render(){
  renderHeader();
  var views=app.querySelectorAll('.view');
  for(var i=0;i<views.length;i++){
    views[i].style.display = tab===views[i].getAttribute('data-tab') ? 'flex':'none';
  }
  if(tab==='chat')renderChat();
  if(tab==='characters')renderCharacters();
  if(tab==='settings')renderSettings();
  var tabs=app.querySelectorAll('.tab');
  for(var j=0;j<tabs.length;j++){
    tabs[j].classList.toggle('active', tabs[j].getAttribute('data-tab')===tab);
  }
}

function buildLayout(){
  app.innerHTML=
    '<header class="app-header"></header>'+
    '<main class="chat-scroll view" data-tab="chat"></main>'+
    '<main class="page page-char view" data-tab="characters" style="display:none"></main>'+
    '<main class="page page-set view" data-tab="settings" style="display:none"></main>'+
    '<div class="input-bar view" data-tab="chat">'+
    '<textarea id="msg" rows="1" placeholder="和 '+activeChar().name+' 说点什么…" enterkeyhint="send"></textarea>'+
    '<button id="send" class="send-btn">➤</button></div>'+
    '<nav class="tabbar">'+
    '<button class="tab" data-tab="chat"><span class="ti">💬</span>聊天</button>'+
    '<button class="tab" data-tab="characters"><span class="ti">👥</span>角色</button>'+
    '<button class="tab" data-tab="settings"><span class="ti">⚙️</span>设置</button>'+
    '</nav><div class="toast" id="toast"></div>';
}

function setSending(on){
  var b=app.querySelector('#send');
  b.disabled=on;b.textContent=on?'⏳':'➤';
}
function autoResize(ta){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px';}
function toast(t){
  var el=app.querySelector('#toast');
  el.textContent=t;el.classList.add('show');
  setTimeout(function(){el.classList.remove('show');},2200);
}

function send(){
  if(sending)return;
  var ta=app.querySelector('#msg');
  var text=ta.value.trim();
  if(!text)return;
  ta.value='';autoResize(ta);

  var list=getSession();
  list.push({id:uid(),role:'user',content:text,time:Date.now()});
  saveMessages(list);
  renderChat();

  sending=true;setSending(true);

  var wrap=app.querySelector('.chat-scroll');
  var c=activeChar();
  wrap.insertAdjacentHTML('beforeend',
    '<div class="msg-row ai"><div class="msg-avatar" style="background:'+c.color+'">'+c.emoji+'</div>'+
    '<div class="bubble" id="typing"><span class="typing-dots"><span></span><span></span><span></span></span></div></div>');
  wrap.scrollTop=wrap.scrollHeight;

  abortCtrl=new AbortController();
  chatCompletion(buildSystem(c), list, abortCtrl.signal).then(function(res){
    var te=document.getElementById('typing');
    if(te&&te.parentElement&&te.parentElement.parentElement){te.parentElement.parentElement.remove();}
    var updated=getSession();
    if(res.ok&&res.content){
      updated.push({id:uid(),role:'ai',content:res.content,time:Date.now()});
    }else{
      updated.push({id:uid(),role:'ai',content:'⚠️ '+(res.error||'出错了，请稍后再试。'),time:Date.now()});
    }
    saveMessages(updated);
    sending=false;setSending(false);
    renderChat();
  });
}

app.addEventListener('click',function(e){
  var target=e.target;
  var tabBtn=target.closest?target.closest('.tab'):null;
  if(tabBtn){tab=tabBtn.getAttribute('data-tab');render();return;}
  var card=target.closest?target.closest('.char-card'):null;
  if(card){
    activeId=card.getAttribute('data-char');
    write(K.active,activeId);
    app.querySelector('#msg').placeholder='和 '+activeChar().name+' 说点什么…';
    tab='chat';render();return;
  }
  if(target.id==='saveBtn'){
    provider={baseUrl:app.querySelector('#setUrl').value.trim(),
      apiKey:app.querySelector('#setKey').value.trim(),
      model:app.querySelector('#setModel').value.trim(),
      temperature:parseFloat(app.querySelector('#setTemp').value)||0.8};
    write(K.provider,provider);
    toast('✅ 设置已保存');return;
  }
  if(target.id==='clearBtn'){saveMessages([]);renderChat();toast('已清空当前对话');return;}
  if(target.id==='send'){send();return;}
});

app.addEventListener('input',function(e){
  if(e.target&&e.target.id==='msg')autoResize(e.target);
});

app.addEventListener('keydown',function(e){
  if(e.target&&e.target.id==='msg'&&e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();send();
  }
});

buildLayout();
render();

})();

require('dotenv').config();
const express=require('express');
const cors=require('cors');
const {createClient}=require('@supabase/supabase-js');
const crypto=require('crypto');
const app=express();
app.use(cors());
app.use(express.json({limit:'20mb'}));
app.use(express.static('public'));

const supabase=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function hashPassword(password){
  return crypto.createHash('sha256').update(password).digest('hex');
}

app.post('/api/register',async(req,res)=>{
  const{email,password,display_name}=req.body;
  if(!email||!password||!display_name) return res.status(400).json({error:'必須項目が不足しています'});
  const{data:existing}=await supabase.from('profiles').select('id').eq('email',email).single();
  if(existing) return res.status(400).json({error:'このメールアドレスは既に登録されています'});
  const id=crypto.randomUUID();
  const{error}=await supabase.from('profiles').insert({id,email,display_name,password_hash:hashPassword(password)});
  if(error) return res.status(500).json({error:error.message});
  res.json({id,email,display_name});
});

app.post('/api/login',async(req,res)=>{
  const{email,password}=req.body;
  const{data,error}=await supabase.from('profiles').select('*').eq('email',email).eq('password_hash',hashPassword(password)).single();
  if(error||!data) return res.status(401).json({error:'メールアドレスまたはパスワードが違います'});
  res.json({id:data.id,email:data.email,display_name:data.display_name});
});

app.get('/api/meals',async(req,res)=>{
  const{user_id}=req.query;
  if(!user_id) return res.status(400).json({error:'user_id required'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',user_id).order('date',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data||[]);
});

app.post('/api/meals',async(req,res)=>{
  const{user_id,date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  if(!user_id) return res.status(400).json({error:'user_id required'});
  const{error}=await supabase.from('meals').insert({user_id,date,meals_data,total_calories,meal_type,protein,fat,carbs});
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

app.delete('/api/meals/:id',async(req,res)=>{
  const{id}=req.params;
  const{error}=await supabase.from('meals').delete().eq('id',id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

app.get('/api/search-user',async(req,res)=>{
  const{email}=req.query;
  const{data,error}=await supabase.from('profiles').select('id,email,display_name').eq('email',email).single();
  if(error||!data) return res.status(404).json({error:'ユーザーが見つかりません'});
  res.json(data);
});

app.post('/api/friend-request',async(req,res)=>{
  const{requester_id,receiver_id}=req.body;
  const{data:existing}=await supabase.from('friendships').select('id').eq('requester_id',requester_id).eq('receiver_id',receiver_id).single();
  if(existing) return res.status(400).json({error:'既に申請済みです'});
  const{error}=await supabase.from('friendships').insert({requester_id,receiver_id,status:'pending'});
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

app.get('/api/friends',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('friendships').select('*').or(`requester_id.eq.${user_id},receiver_id.eq.${user_id}`);
  if(error) return res.status(500).json({error:error.message});
  if(!data||data.length===0) return res.json([]);
  const friendIds=data.map(f=>f.requester_id===user_id?f.receiver_id:f.requester_id);
  const{data:profiles}=await supabase.from('profiles').select('id,email,display_name').in('id',friendIds);
  const result=data.map(f=>{
    const friendId=f.requester_id===user_id?f.receiver_id:f.requester_id;
    const profile=profiles.find(p=>p.id===friendId);
    return{friendship_id:f.id,friend_id:friendId,display_name:profile?.display_name,email:profile?.email,status:f.status,i_am_requester:f.requester_id===user_id};
  });
  res.json(result);
});

app.post('/api/friend-respond',async(req,res)=>{
  const{friendship_id,status}=req.body;
  const{error}=await supabase.from('friendships').update({status}).eq('id',friendship_id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

app.get('/api/friend-meals',async(req,res)=>{
  const{user_id,friend_id}=req.query;
  const{data:friendship}=await supabase.from('friendships').select('*')
    .or(`and(requester_id.eq.${user_id},receiver_id.eq.${friend_id}),and(requester_id.eq.${friend_id},receiver_id.eq.${user_id})`)
    .eq('status','accepted').single();
  if(!friendship) return res.status(403).json({error:'友達ではありません'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',friend_id).order('date',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data||[]);
});

// コメント取得
app.get('/api/comments/:meal_id',async(req,res)=>{
  const{meal_id}=req.params;
  const{data,error}=await supabase.from('comments').select('*').eq('meal_id',meal_id).order('created_at',{ascending:true});
  if(error) return res.status(500).json({error:error.message});
  const userIds=[...new Set((data||[]).map(c=>c.user_id))];
  if(userIds.length===0) return res.json([]);
  const{data:profiles}=await supabase.from('profiles').select('id,display_name').in('id',userIds);
  const result=(data||[]).map(c=>({...c,display_name:profiles?.find(p=>p.id===c.user_id)?.display_name||''}));
  res.json(result);
});

// コメント投稿
app.post('/api/comments',async(req,res)=>{
  const{meal_id,user_id,content}=req.body;
  if(!meal_id||!user_id||!content) return res.status(400).json({error:'必須項目不足'});
  const{error}=await supabase.from('comments').insert({meal_id,user_id,content});
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

app.post('/api/ai',async(req,res)=>{
  const{system,user,images}=req.body;
  const apiKey=process.env.ANTHROPIC_API_KEY;
  if(!apiKey) return res.status(500).json({error:'APIキーが設定されていません'});
  const content=[];
  if(images&&images.length>0){
    images.forEach(b64=>{
      content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}});
    });
  }
  content.push({type:'text',text:user});
  const messages=[{role:'user',content}];
  try{
    const response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-opus-4-6',max_tokens:1000,system,messages})
    });
    const data=await response.json();
    res.json({text:data.content?.[0]?.text||''});
  }catch(e){
    res.status(500).json({error:e.message});
  }
});

app.listen(3000,()=>console.log('Server running on http://localhost:3000'));
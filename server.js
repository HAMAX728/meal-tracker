require('dotenv').config();
const express=require('express');
const cors=require('cors');
const {createClient}=require('@supabase/supabase-js');
const crypto=require('crypto');
const app=express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabase=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function hashPassword(password){
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 登録
app.post('/api/register',async(req,res)=>{
  const{email,password,display_name}=req.body;
  if(!email||!password||!display_name) return res.status(400).json({error:'必須項目が不足しています'});
  const{data:existing}=await supabase.from('profiles').select('id').eq('email',email).single();
  if(existing) return res.status(400).json({error:'このメールアドレスは既に登録されています'});
  const id=crypto.randomUUID();
  const password_hash=hashPassword(password);
  const{error}=await supabase.from('profiles').insert({id,email,display_name,password_hash});
  if(error) return res.status(500).json({error:error.message});
  res.json({id,email,display_name});
});

// ログイン
app.post('/api/login',async(req,res)=>{
  const{email,password}=req.body;
  const{data,error}=await supabase.from('profiles').select('*').eq('email',email).eq('password_hash',hashPassword(password)).single();
  if(error||!data) return res.status(401).json({error:'メールアドレスまたはパスワードが違います'});
  res.json({id:data.id,email:data.email,display_name:data.display_name});
});

// 食事取得（自分）
app.get('/api/meals',async(req,res)=>{
  const{user_id}=req.query;
  if(!user_id) return res.status(400).json({error:'user_id required'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',user_id).order('date',{ascending:false});
  if(error) return res.status(500).json({error:error.message});
  res.json(data||[]);
});

// 食事保存
app.post('/api/meals',async(req,res)=>{
  const{user_id,date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  if(!user_id) return res.status(400).json({error:'user_id required'});
  const{error}=await supabase.from('meals').insert({user_id,date,meals_data,total_calories,meal_type,protein,fat,carbs});
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// ユーザー検索
app.get('/api/search-user',async(req,res)=>{
  const{email}=req.query;
  const{data,error}=await supabase.from('profiles').select('id,email,display_name').eq('email',email).single();
  if(error||!data) return res.status(404).json({error:'ユーザーが見つかりません'});
  res.json(data);
});

// 友達申請
app.post('/api/friend-request',async(req,res)=>{
  const{requester_id,receiver_id}=req.body;
  const{data:existing}=await supabase.from('friendships').select('id').eq('requester_id',requester_id).eq('receiver_id',receiver_id).single();
  if(existing) return res.status(400).json({error:'既に申請済みです'});
  const{error}=await supabase.from('friendships').insert({requester_id,receiver_id,status:'pending'});
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// 友達一覧取得
app.get('/api/friends',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('friendships').select('*').or(`requester_id.eq.${user_id},receiver_id.eq.${user_id}`);
  if(error) return res.status(500).json({error:error.message});
  const friendIds=data.map(f=>f.requester_id===user_id?f.receiver_id:f.requester_id);
  const friendshipData=data;
  if(friendIds.length===0) return res.json([]);
  const{data:profiles}=await supabase.from('profiles').select('id,email,display_name').in('id',friendIds);
  const result=friendshipData.map(f=>{
    const friendId=f.requester_id===user_id?f.receiver_id:f.requester_id;
    const profile=profiles.find(p=>p.id===friendId);
    return{friendship_id:f.id,friend_id:friendId,display_name:profile?.display_name,email:profile?.email,status:f.status,i_am_requester:f.requester_id===user_id};
  });
  res.json(result);
});

// 友達申請を承認/拒否
app.post('/api/friend-respond',async(req,res)=>{
  const{friendship_id,status}=req.body;
  const{error}=await supabase.from('friendships').update({status}).eq('id',friendship_id);
  if(error) return res.status(500).json({error:error.message});
  res.json({success:true});
});

// 友達の食事取得
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

app.listen(3000,()=>console.log('Server running on http://localhost:3000'));
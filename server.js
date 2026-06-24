require('dotenv').config();
const express=require('express');
const cors=require('cors');
const {createClient}=require('@supabase/supabase-js');
const app=express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.static('public'));

const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY);

// ログイン
app.post('/api/login',async(req,res)=>{
  const{email,password}=req.body;
  const{data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error)return res.json({error:error.message});
  // profiles自動登録
  await supabase.from('profiles').upsert({id:data.user.id,email:data.user.email});
  res.json({user:{id:data.user.id,email:data.user.email}});
});

// 新規登録
app.post('/api/register',async(req,res)=>{
  const{email,password}=req.body;
  const{data,error}=await supabase.auth.signUp({email,password});
  if(error)return res.json({error:error.message});
  await supabase.from('profiles').upsert({id:data.user.id,email:data.user.email});
  res.json({user:{id:data.user.id,email:data.user.email}});
});

// 食事一覧取得
app.get('/api/meals',async(req,res)=>{
  const userId=req.query.user_id;
  if(!userId)return res.status(400).json({error:'user_id required'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',userId).order('date',{ascending:false});
  if(error){console.error('meals GET error:',error);return res.status(500).json({error});}
  res.json(data||[]);
});

// 食事保存
app.post('/api/meals',async(req,res)=>{
  const{date,meals_data,total_calories,meal_type,protein,fat,carbs,user_id}=req.body;
  if(!user_id)return res.status(400).json({error:'user_id required'});
  const{error}=await supabase.from('meals').insert({date,meals_data,total_calories,meal_type,protein,fat,carbs,user_id});
  if(error){console.error('meals POST error:',error);return res.status(500).json({error});}
  res.json({success:true});
});

// 食事削除
app.delete('/api/meals/:id',async(req,res)=>{
  const{error}=await supabase.from('meals').delete().eq('id',req.params.id);
  if(error)return res.status(500).json({error});
  res.json({success:true});
});

// AI proxy
app.post('/api/ai',async(req,res)=>{
  try{
    const response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':process.env.ANTHROPIC_API_KEY,
        'anthropic-version':'2023-06-01'
      },
      body:JSON.stringify(req.body)
    });
    const data=await response.json();
    res.json(data);
  }catch(e){
    res.status(500).json({error:'AI呼び出し失敗'});
  }
});

// ユーザー検索
app.get('/api/search-user',async(req,res)=>{
  const{email}=req.query;
  const{data,error}=await supabase.from('profiles').select('*').eq('email',email).single();
  if(error||!data)return res.json({user:null});
  res.json({user:data});
});

// 友達一覧取得
app.get('/api/friendships',async(req,res)=>{
  const userId=req.query.user_id;
  if(!userId)return res.status(400).json({error:'user_id required'});
  const{data:sent}=await supabase.from('friendships').select('*').eq('user_id',userId).eq('status','approved');
  const{data:received}=await supabase.from('friendships').select('*').eq('friend_id',userId).eq('status','approved');
  const{data:requests}=await supabase.from('friendships').select('*').eq('friend_id',userId).eq('status','pending');
  const friendIds=[...(sent||[]).map(f=>f.friend_id),...(received||[]).map(f=>f.user_id)];
  const friends=[];
  for(const fid of friendIds){
    const{data:p}=await supabase.from('profiles').select('*').eq('id',fid).single();
    if(p)friends.push(p);
  }
  const reqs=[];
  for(const r of(requests||[])){
    const{data:p}=await supabase.from('profiles').select('*').eq('id',r.user_id).single();
    if(p)reqs.push({...p,friendship_id:r.id});
  }
  res.json({friends,requests:reqs});
});

// 友達申請・承認・拒否
app.post('/api/friendships',async(req,res)=>{
  const{action,friend_id,friendship_id,user_id}=req.body;
  if(action==='request'){
    const{error}=await supabase.from('friendships').insert({user_id,friend_id,status:'pending'});
    if(error)return res.status(500).json({error});
    return res.json({success:true});
  }
  if(action==='approve'){
    const{error}=await supabase.from('friendships').update({status:'approved'}).eq('id',friendship_id);
    if(error)return res.status(500).json({error});
    return res.json({success:true});
  }
  if(action==='reject'){
    const{error}=await supabase.from('friendships').delete().eq('id',friendship_id);
    if(error)return res.status(500).json({error});
    return res.json({success:true});
  }
  res.status(400).json({error:'invalid action'});
});

// 友達の食事取得
app.get('/api/friend-meals/:friendId',async(req,res)=>{
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',req.params.friendId).order('date',{ascending:false});
  if(error)return res.status(500).json({error});
  res.json(data||[]);
});

app.listen(3000,()=>console.log('Server running on http://localhost:3000'));
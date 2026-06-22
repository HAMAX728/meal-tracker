require('dotenv').config();
const express=require('express');
const cors=require('cors');
const {createClient}=require('@supabase/supabase-js');
const app=express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.static('public'));

const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY);

function getUser(req){
  const auth=req.headers.authorization;
  if(!auth)return null;
  return auth.replace('Bearer ','');
}

async function getUserId(token){
  const{data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return null;
  return data.user.id;
}

// 食事一覧取得
app.get('/api/meals',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const userId=await getUserId(token);
  if(!userId)return res.status(401).json({error:'Unauthorized'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',userId).order('date',{ascending:false});
  if(error)return res.status(500).json({error});
  res.json(data||[]);
});

// 食事保存
app.post('/api/meals',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const userId=await getUserId(token);
  if(!userId)return res.status(401).json({error:'Unauthorized'});
  const{date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  const{error}=await supabase.from('meals').insert({date,meals_data,total_calories,meal_type,protein,fat,carbs,user_id:userId});
  if(error)return res.status(500).json({error});
  res.json({success:true});
});

// 食事更新
app.put('/api/meals/:id',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const userId=await getUserId(token);
  if(!userId)return res.status(401).json({error:'Unauthorized'});
  const{date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  const{error}=await supabase.from('meals').update({date,meals_data,total_calories,meal_type,protein,fat,carbs}).eq('id',req.params.id).eq('user_id',userId);
  if(error)return res.status(500).json({error});
  res.json({success:true});
});

// 食事削除
app.delete('/api/meals/:id',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const userId=await getUserId(token);
  if(!userId)return res.status(401).json({error:'Unauthorized'});
  const{error}=await supabase.from('meals').delete().eq('id',req.params.id).eq('user_id',userId);
  if(error)return res.status(500).json({error});
  res.json({success:true});
});

// プロフィール作成
app.post('/api/profile',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const userId=await getUserId(token);
  if(!userId)return res.status(401).json({error:'Unauthorized'});
  const{display_name}=req.body;
  const{data:existing}=await supabase.from('profiles').select('id').eq('id',userId).single();
  if(existing){
    await supabase.from('profiles').update({display_name}).eq('id',userId);
  }else{
    await supabase.from('profiles').insert({id:userId,display_name});
  }
  res.json({success:true});
});

// ユーザー検索
app.get('/api/search-user',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const{email}=req.query;
  if(!email)return res.status(400).json({error:'email required'});
  const{data,error}=await supabase.from('profiles').select('id,display_name,email').eq('email',email).single();
  if(error||!data)return res.status(404).json({error:'Not found'});
  res.json(data);
});

// 友達一覧取得
app.get('/api/friendships',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const userId=await getUserId(token);
  if(!userId)return res.status(401).json({error:'Unauthorized'});
  const{data,error}=await supabase.from('friendships').select('*,requester:profiles!friendships_requester_id_fkey(id,display_name,email),receiver:profiles!friendships_receiver_id_fkey(id,display_name,email)').or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);
  if(error)return res.status(500).json({error});
  res.json(data||[]);
});

// 友達申請
app.post('/api/friendships',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const userId=await getUserId(token);
  if(!userId)return res.status(401).json({error:'Unauthorized'});
  const{receiver_id}=req.body;
  const{error}=await supabase.from('friendships').insert({requester_id:userId,receiver_id,status:'pending'});
  if(error)return res.status(500).json({error});
  res.json({success:true});
});

// 友達申請承認・拒否
app.put('/api/friendships/:id',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const{status}=req.body;
  const{error}=await supabase.from('friendships').update({status}).eq('id',req.params.id);
  if(error)return res.status(500).json({error});
  res.json({success:true});
});

// 友達削除
app.delete('/api/friendships/:id',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const{error}=await supabase.from('friendships').delete().eq('id',req.params.id);
  if(error)return res.status(500).json({error});
  res.json({success:true});
});

// 友達の食事取得
app.get('/api/friend-meals/:friendId',async(req,res)=>{
  const token=getUser(req);
  if(!token)return res.status(401).json({error:'Unauthorized'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',req.params.friendId).order('date',{ascending:false});
  if(error)return res.status(500).json({error});
  res.json(data||[]);
});

// AI呼び出し
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
    console.error('AIエラー:',e);
    res.status(500).json({error:'AI呼び出し失敗'});
  }
});

app.listen(3000,()=>console.log('Server running on http://localhost:3000'));
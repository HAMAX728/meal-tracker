require('dotenv').config();
const express=require('express');
const cors=require('cors');
const {createClient}=require('@supabase/supabase-js');
const app=express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.static('public'));

const supabaseUrl=process.env.SUPABASE_URL;
const supabaseKey=process.env.SUPABASE_ANON_KEY;
const supabase=createClient(supabaseUrl,supabaseKey);

// 食事取得
app.get('/api/meals',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',user.id).order('date',{ascending:false});
  if(error) return res.status(500).json({error});
  res.json(data||[]);
});

// 友達の食事取得
app.get('/api/friend-meals/:friendId',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{friendId}=req.params;
  // 友達関係確認
  const{data:friendship}=await supabase.from('friendships').select('*')
    .or(`and(requester_id.eq.${user.id},receiver_id.eq.${friendId}),and(requester_id.eq.${friendId},receiver_id.eq.${user.id})`)
    .eq('status','accepted').single();
  if(!friendship) return res.status(403).json({error:'not friends'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',friendId).order('date',{ascending:false});
  if(error) return res.status(500).json({error});
  res.json(data||[]);
});

// 食事登録
app.post('/api/meals',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  const{error}=await supabase.from('meals').insert({date,meals_data,total_calories,meal_type,protein,fat,carbs,user_id:user.id});
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

// 食事更新
app.put('/api/meals/:id',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{id}=req.params;
  const{date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  const{error}=await supabase.from('meals').update({date,meals_data,total_calories,meal_type,protein,fat,carbs}).eq('id',id).eq('user_id',user.id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

// 食事削除
app.delete('/api/meals/:id',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{id}=req.params;
  const{error}=await supabase.from('meals').delete().eq('id',id).eq('user_id',user.id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

// プロフィール作成・取得
app.post('/api/profile',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{display_name}=req.body;
  const{data,error}=await supabase.from('profiles').upsert({id:user.id,email:user.email,display_name}).select().single();
  if(error) return res.status(500).json({error});
  res.json(data);
});

app.get('/api/profile',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{data,error}=await supabase.from('profiles').select('*').eq('id',user.id).single();
  if(error) return res.status(500).json({error});
  res.json(data);
});

// メールで友達検索
app.get('/api/search-user',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{email}=req.query;
  const{data,error}=await supabase.from('profiles').select('id,email,display_name').eq('email',email).neq('id',user.id).single();
  if(error||!data) return res.status(404).json({error:'not found'});
  res.json(data);
});

// 友達申請
app.post('/api/friendships',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{receiver_id}=req.body;
  const{error}=await supabase.from('friendships').insert({requester_id:user.id,receiver_id,status:'pending'});
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

// 友達一覧取得
app.get('/api/friendships',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{data,error}=await supabase.from('friendships').select(`
    *,
    requester:profiles!friendships_requester_id_fkey(id,email,display_name),
    receiver:profiles!friendships_receiver_id_fkey(id,email,display_name)
  `).or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
  if(error) return res.status(500).json({error});
  res.json(data||[]);
});

// 友達申請承認/拒否
app.put('/api/friendships/:id',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{id}=req.params;
  const{status}=req.body;
  const{error}=await supabase.from('friendships').update({status}).eq('id',id).eq('receiver_id',user.id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

// 友達削除
app.delete('/api/friendships/:id',async(req,res)=>{
  const token=req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({error:'unauthorized'});
  const{data:{user}}=await supabase.auth.getUser(token);
  if(!user) return res.status(401).json({error:'unauthorized'});
  const{id}=req.params;
  const{error}=await supabase.from('friendships').delete().eq('id',id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

// AI分析
app.post('/api/ai-advice',async(req,res)=>{
  const{prompt,systemPrompt,image}=req.body;
  try{
    let userContent;
    if(image){
      userContent=[
        {type:'image',source:{type:'base64',media_type:'image/jpeg',data:image}},
        {type:'text',text:prompt}
      ];
    }else{
      userContent=prompt;
    }
    const response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':process.env.ANTHROPIC_API_KEY,
        'anthropic-version':'2023-06-01'
      },
      body:JSON.stringify({
        model:'claude-sonnet-4-6',
        max_tokens:1000,
        system:systemPrompt,
        messages:[{role:'user',content:userContent}]
      })
    });
    const data=await response.json();
    res.json(data);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'AI error'});
  }
});

app.listen(3000,()=>console.log('Server running on http://localhost:3000'));
require('dotenv').config();
const express=require('express');
const cors=require('cors');
const nodemailer=require('nodemailer');
const {createClient}=require('@supabase/supabase-js');
const app=express();
app.use(cors());
app.use(express.json({limit:'50mb'}));
app.use(express.static('public'));

const supabaseUrl=process.env.SUPABASE_URL;
const supabaseKey=process.env.SUPABASE_ANON_KEY;
const supabase=createClient(supabaseUrl,supabaseKey);

// メール送信設定（SMTP）。環境変数が未設定なら通知はスキップされる。
let mailTransporter=null;
if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS){
  mailTransporter=nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:parseInt(process.env.SMTP_PORT)||587,
    secure:process.env.SMTP_SECURE==='true',
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });
}

// 食事を記録したユーザーの友達（承認済み）に通知メールを送る
async function notifyFriendsOfMeal(user_id,meal_type,meals_data){
  if(!mailTransporter) return;
  try{
    const{data:author}=await supabase.from('profiles').select('display_name').eq('id',user_id).single();
    const authorName=author?.display_name||'友達';
    const{data:friendships}=await supabase.from('friendships').select('requester_id,receiver_id').or(`requester_id.eq.${user_id},receiver_id.eq.${user_id}`).eq('status','accepted');
    if(!friendships||friendships.length===0) return;
    const friendIds=friendships.map(f=>f.requester_id===user_id?f.receiver_id:f.requester_id);
    const{data:friends}=await supabase.from('profiles').select('display_name,notification_email').in('id',friendIds);
    const mealTypeLabels={breakfast:'朝食',lunch:'昼食',dinner:'夕食',snack:'間食'};
    const typeLabel=mealTypeLabels[meal_type]||'食事';
    const recipients=(friends||[]).filter(f=>f.notification_email&&f.notification_email.trim());
    for(const f of recipients){
      try{
        await mailTransporter.sendMail({
          from:process.env.SMTP_FROM||process.env.SMTP_USER,
          to:f.notification_email.trim(),
          subject:`🐷 ぽちゃログ：${authorName}さんが${typeLabel}を記録しました`,
          text:`${authorName}さんが${typeLabel}を記録しました。\n\n内容：${meals_data||''}\n\nぽちゃログでチェックしてみましょう！`
        });
      }catch(e){console.error('メール送信失敗:',f.notification_email,e.message);}
    }
  }catch(e){console.error('通知処理エラー:',e.message);}
}

app.get('/api/meals',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',user_id).order('date',{ascending:false});
  if(error) return res.status(500).json({error});
  res.json(data||[]);
});

app.post('/api/meals',async(req,res)=>{
  const{user_id,date,meals_data,total_calories,meal_type,protein,fat,carbs,sodium,has_alcohol,alcohol_g,restaurant_name}=req.body;
  const{error}=await supabase.from('meals').insert({user_id,date,meals_data,total_calories,meal_type,protein,fat,carbs,sodium,has_alcohol,alcohol_g,restaurant_name});
  if(error) return res.status(500).json({error});
  if(restaurant_name&&restaurant_name.trim()){
    const{data:existing}=await supabase.from('restaurants').select('id').eq('user_id',user_id).eq('name',restaurant_name.trim()).single();
    if(!existing){
      await supabase.from('restaurants').insert({user_id,name:restaurant_name.trim(),status:'visited',visited_at:date});
    }
  }
  notifyFriendsOfMeal(user_id,meal_type,meals_data);
  res.json({success:true});
});

app.put('/api/meals/:id',async(req,res)=>{
  const{id}=req.params;
  const{meals_data,meal_type,total_calories,protein,fat,carbs,sodium,has_alcohol,alcohol_g}=req.body;
  const{error}=await supabase.from('meals').update({meals_data,meal_type,total_calories,protein,fat,carbs,sodium,has_alcohol,alcohol_g}).eq('id',id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.delete('/api/meals/:id',async(req,res)=>{
  const{id}=req.params;
  const{error}=await supabase.from('meals').delete().eq('id',id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.post('/api/login',async(req,res)=>{
  const{email,password}=req.body;
  const crypto=require('crypto');
  const hash=crypto.createHash('sha256').update(password).digest('hex');
  const{data,error}=await supabase.from('profiles').select('*').eq('email',email).eq('password_hash',hash).single();
  if(error||!data) return res.status(401).json({error:'メールアドレスまたはパスワードが違います'});
  res.json({id:data.id,email:data.email,display_name:data.display_name});
});

app.post('/api/register',async(req,res)=>{
  const{email,password,display_name}=req.body;
  const crypto=require('crypto');
  const hash=crypto.createHash('sha256').update(password).digest('hex');
  const{data:existing}=await supabase.from('profiles').select('id').eq('email',email).single();
  if(existing) return res.status(400).json({error:'このメールアドレスは既に登録されています'});
  const{data,error}=await supabase.from('profiles').insert({email,password_hash:hash,display_name}).select().single();
  if(error) return res.status(500).json({error:error.message});
  res.json({id:data.id,email:data.email,display_name:data.display_name});
});

app.get('/api/profile',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('profiles').select('id,email,display_name,notification_email').eq('id',user_id).single();
  if(error) return res.status(500).json({error});
  res.json(data);
});

app.post('/api/notification-email',async(req,res)=>{
  const{user_id,notification_email}=req.body;
  const{error}=await supabase.from('profiles').update({notification_email}).eq('id',user_id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.get('/api/search-user',async(req,res)=>{
  const{email}=req.query;
  const{data,error}=await supabase.from('profiles').select('id,email,display_name').eq('email',email).single();
  if(error||!data) return res.status(404).json({error:'ユーザーが見つかりません'});
  res.json(data);
});

app.get('/api/friends',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('friendships').select('*').or(`requester_id.eq.${user_id},receiver_id.eq.${user_id}`);
  if(error) return res.status(500).json({error});
  const friendIds=data.map(f=>f.requester_id===user_id?f.receiver_id:f.requester_id);
  if(friendIds.length===0) return res.json([]);
  const{data:profiles}=await supabase.from('profiles').select('id,email,display_name').in('id',friendIds);
  const result=data.map(f=>{
    const friendId=f.requester_id===user_id?f.receiver_id:f.requester_id;
    const profile=profiles.find(p=>p.id===friendId);
    return{friendship_id:f.id,friend_id:friendId,display_name:profile?.display_name,email:profile?.email,status:f.status,i_am_requester:f.requester_id===user_id};
  });
  res.json(result);
});

app.post('/api/friend-request',async(req,res)=>{
  const{requester_id,receiver_id}=req.body;
  const{data:existing}=await supabase.from('friendships').select('id').or(`and(requester_id.eq.${requester_id},receiver_id.eq.${receiver_id}),and(requester_id.eq.${receiver_id},receiver_id.eq.${requester_id})`);
  if(existing&&existing.length>0) return res.status(400).json({error:'既に申請済みまたは友達です'});
  const{error}=await supabase.from('friendships').insert({requester_id,receiver_id,status:'pending'});
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.post('/api/friend-respond',async(req,res)=>{
  const{friendship_id,status}=req.body;
  const{error}=await supabase.from('friendships').update({status}).eq('id',friendship_id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.get('/api/friend-meals',async(req,res)=>{
  const{user_id,friend_id}=req.query;
  const{data:friendship}=await supabase.from('friendships').select('id').or(`and(requester_id.eq.${user_id},receiver_id.eq.${friend_id}),and(requester_id.eq.${friend_id},receiver_id.eq.${user_id})`).eq('status','accepted');
  if(!friendship||friendship.length===0) return res.status(403).json({error:'友達ではありません'});
  const{data,error}=await supabase.from('meals').select('*').eq('user_id',friend_id).order('date',{ascending:false});
  if(error) return res.status(500).json({error});
  res.json(data||[]);
});

app.get('/api/friend-progress',async(req,res)=>{
  const{user_id,friend_id}=req.query;
  const{data:friendship}=await supabase.from('friendships').select('id').or(`and(requester_id.eq.${user_id},receiver_id.eq.${friend_id}),and(requester_id.eq.${friend_id},receiver_id.eq.${user_id})`).eq('status','accepted');
  if(!friendship||friendship.length===0) return res.status(403).json({error:'友達ではありません'});
  const{data:goal}=await supabase.from('weight_goals').select('*').eq('user_id',friend_id).single();
  if(!goal) return res.json({no_goal:true});
  const bmr=goal.gender==='male'?66.5+13.75*goal.current_weight+5.003*goal.height-6.755*goal.age:655.1+9.563*goal.current_weight+1.850*goal.height-4.676*goal.age;
  const{data:meals}=await supabase.from('meals').select('date,total_calories').eq('user_id',friend_id);
  const{data:steps}=await supabase.from('daily_steps').select('date,steps').eq('user_id',friend_id);
  const stepsMap={};
  (steps||[]).forEach(s=>{stepsMap[s.date]=s.steps;});
  const dateMap={};
  (meals||[]).forEach(m=>{if(!dateMap[m.date])dateMap[m.date]=0;dateMap[m.date]+=m.total_calories||0;});
  let cumulative=0;
  for(const date of Object.keys(dateMap)){
    const daySteps=stepsMap[date]||0;
    const consumed=Math.round(bmr+daySteps*0.035);
    cumulative+=consumed-dateMap[date];
  }
  const total=(goal.current_weight-goal.target_weight)*7200;
  const pct=Math.min(Math.round((cumulative/total)*100),100);
  res.json({progress_pct:pct,cumulative_deficit:Math.round(cumulative),total_deficit:Math.round(total)});
});

app.get('/api/comments/:meal_id',async(req,res)=>{
  const{meal_id}=req.params;
  const{data,error}=await supabase.from('comments').select('*').eq('meal_id',meal_id).order('created_at',{ascending:true});
  if(error) return res.status(500).json({error});
  const userIds=[...new Set((data||[]).map(c=>c.user_id))];
  if(userIds.length===0) return res.json([]);
  const{data:profiles}=await supabase.from('profiles').select('id,display_name').in('id',userIds);
  const result=(data||[]).map(c=>({...c,display_name:profiles?.find(p=>p.id===c.user_id)?.display_name||'不明'}));
  res.json(result);
});

app.post('/api/comments',async(req,res)=>{
  const{meal_id,user_id,content}=req.body;
  const{error}=await supabase.from('comments').insert({meal_id:String(meal_id),user_id,content});
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.get('/api/weight-goal',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('weight_goals').select('*').eq('user_id',user_id).single();
  if(error) return res.json(null);
  res.json(data);
});

app.post('/api/weight-goal',async(req,res)=>{
  const{user_id,current_weight,target_weight,height,age,gender}=req.body;
  const{data:existing}=await supabase.from('weight_goals').select('id').eq('user_id',user_id).single();
  if(existing){
    await supabase.from('weight_goals').update({current_weight,target_weight,height,age,gender}).eq('user_id',user_id);
  }else{
    await supabase.from('weight_goals').insert({user_id,current_weight,target_weight,height,age,gender});
  }
  res.json({success:true});
});

app.get('/api/steps',async(req,res)=>{
  const{user_id,date}=req.query;
  const{data,error}=await supabase.from('daily_steps').select('steps').eq('user_id',user_id).eq('date',date).single();
  if(error) return res.json({steps:0});
  res.json({steps:data?.steps||0});
});

app.post('/api/steps',async(req,res)=>{
  const{user_id,date,steps}=req.body;
  const{data:existing}=await supabase.from('daily_steps').select('id').eq('user_id',user_id).eq('date',date).single();
  if(existing){
    await supabase.from('daily_steps').update({steps}).eq('user_id',user_id).eq('date',date);
  }else{
    await supabase.from('daily_steps').insert({user_id,date,steps});
  }
  res.json({success:true});
});

app.get('/api/steps-all',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('daily_steps').select('date,steps').eq('user_id',user_id);
  if(error) return res.json({});
  const map={};
  (data||[]).forEach(s=>{map[s.date]=s.steps;});
  res.json(map);
});

app.post('/api/ai',async(req,res)=>{
  const{system,user,images}=req.body;
  try{
    const messages=[{role:'user',content:images&&images.length>0?[...images.map(img=>({type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}})),{type:'text',text:user}]:[{type:'text',text:user}]}];
    const response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-opus-4-6',max_tokens:1000,system,messages})
    });
    const data=await response.json();
    res.json({text:data.content?.[0]?.text||''});
  }catch(e){
    res.status(500).json({error:e.message});
  }
});

// レストランAPI
app.get('/api/restaurants',async(req,res)=>{
  const{user_id}=req.query;
  const{data,error}=await supabase.from('restaurants').select('*').eq('user_id',user_id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error});
  res.json(data||[]);
});

app.post('/api/restaurants',async(req,res)=>{
  const{user_id,name,genre,area,url,memo,status}=req.body;
  const{error}=await supabase.from('restaurants').insert({user_id,name,genre,area,url,memo,status:status||'want'});
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.patch('/api/restaurants/:id',async(req,res)=>{
  const{id}=req.params;
  const updates=req.body;
  const{error}=await supabase.from('restaurants').update(updates).eq('id',id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.delete('/api/restaurants/:id',async(req,res)=>{
  const{id}=req.params;
  const{error}=await supabase.from('restaurants').delete().eq('id',id);
  if(error) return res.status(500).json({error});
  res.json({success:true});
});

app.get('/api/friend-restaurants',async(req,res)=>{
  const{user_id,friend_id}=req.query;
  const{data:friendship}=await supabase.from('friendships').select('id').or(`and(requester_id.eq.${user_id},receiver_id.eq.${friend_id}),and(requester_id.eq.${friend_id},receiver_id.eq.${user_id})`).eq('status','accepted');
  if(!friendship||friendship.length===0) return res.status(403).json({error:'友達ではありません'});
  const{data,error}=await supabase.from('restaurants').select('*').eq('user_id',friend_id).order('created_at',{ascending:false});
  if(error) return res.status(500).json({error});
  res.json(data||[]);
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('Server running on http://localhost:'+PORT));
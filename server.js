require('dotenv').config();
const express=require('express');
const cors=require('cors');
const {createClient}=require('@supabase/supabase-js');
const app=express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabaseUrl=process.env.SUPABASE_URL;
const supabaseKey=process.env.SUPABASE_ANON_KEY;
console.log('URL:', supabaseUrl);
console.log('KEY:', supabaseKey ? '読み込み成功' : '読み込み失敗');

const supabase=createClient(supabaseUrl, supabaseKey);

app.get('/api/meals',async(req,res)=>{
  const{data,error}=await supabase.from('meals').select('*').order('date',{ascending:false});
  if(error){console.error('GETエラー:',error);return res.status(500).json({error});}
  res.json(data||[]);
});

app.post('/api/meals',async(req,res)=>{
  const{date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  console.log('保存データ:',{date,meals_data,total_calories,meal_type,protein,fat,carbs});
  const{error}=await supabase.from('meals').insert({date,meals_data,total_calories,meal_type,protein,fat,carbs});
  if(error){console.error('POSTエラー:',error);return res.status(500).json({error});}
  res.json({success:true});
});

app.put('/api/meals/:id',async(req,res)=>{
  const{id}=req.params;
  const{date,meals_data,total_calories,meal_type,protein,fat,carbs}=req.body;
  const{error}=await supabase.from('meals').update({date,meals_data,total_calories,meal_type,protein,fat,carbs}).eq('id',id);
  if(error){console.error('PUTエラー:',error);return res.status(500).json({error});}
  res.json({success:true});
});

app.delete('/api/meals/:id',async(req,res)=>{
  const{id}=req.params;
  const{error}=await supabase.from('meals').delete().eq('id',id);
  if(error){console.error('DELETEエラー:',error);return res.status(500).json({error});}
  res.json({success:true});
});
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
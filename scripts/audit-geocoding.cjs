// Diagnóstico privado. Sem --apply, não altera nenhum cadastro.
const fs=require('fs'),path=require('path'),ts=require('typescript'),Module=require('module');
Object.assign(process.env,require('dotenv').parse(fs.readFileSync('.env.local')));
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);cache.set(file,m);m.paths=Module._nodeModulePaths(path.dirname(file));m.require=name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts'):require(name);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);return m.exports;}
const {geocodeAddress}=load('lib/geocode.ts');
const client=require('@supabase/supabase-js').createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
(async()=>{
 const {data,error}=await client.from('employees').select('id,address,address_lat,address_lng').order('id');if(error)throw new Error(error.message);
 const rows=[];
 for(const original of data){const result=await geocodeAddress(original.address);rows.push({original,result});console.log(`Cadastro ${rows.length}/${data.length}: ${result ? 'número e cidade confirmados pela busca' : 'precisa confirmar o ponto no mapa/GPS'}`);await new Promise(r=>setTimeout(r,1100));}
 fs.mkdirSync('.location-audit',{recursive:true});const file=path.join('.location-audit',`employees-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(rows,null,2));
 let updated=0;
 if(process.argv.includes('--apply'))for(const row of rows){if(!row.result)continue;const {data,error}=await client.from('employees').update({address_lat:row.result.lat,address_lng:row.result.lng,address_needs_review:false}).eq('id',row.original.id).eq('address',row.original.address).select('id').single();if(error)throw new Error(error.message);updated++;}
 console.log(JSON.stringify({total:rows.length,precise:rows.filter(r=>r.result).length,needsReview:rows.filter(r=>!r.result).length,updated,privateBackup:file}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

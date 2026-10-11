/** Minimal stdio MCP surface; bounded synthetic operations only. */
import {runResearch,candidates,allocatePrize,exactKeys} from './core.mjs';
import {appendJournal} from './log.mjs';
import {fileURLToPath} from 'node:url';
import {planMarketObservation} from './phone.mjs';
const journal=fileURLToPath(new URL('../runtime/mcp-experiments.jsonl',import.meta.url));
const definitions=[
  {name:'strategy_candidates',description:'List the fixed eight non-executable research hypotheses.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'research_synthetic',description:'Run one synthetic research experiment; journal all candidates and failures. No market data, account access or live trading.',inputSchema:{type:'object',properties:{seed:{type:'integer',minimum:0,maximum:4294967295}},required:['seed'],additionalProperties:false}},
  {name:'prize_simulate',description:'Allocate a fixed integer demo-credit pool; unrelated to investment returns.',inputSchema:{type:'object',properties:{pool:{type:'integer',minimum:0,maximum:1000000000},weights:{type:'array',minItems:1,maxItems:20,items:{type:'integer',minimum:0,maximum:1000000}}},required:['pool','weights'],additionalProperties:false}},
  {name:'phone_market_plan',description:'Return an unverified, non-executable allowlisted public-market observation plan. No device connection.',inputSchema:{type:'object',properties:{app:{type:'string',enum:['apple-stocks','tradingview','yahoo-finance']},page:{type:'string',enum:['market-overview','symbol-chart']},symbol:{type:'string'},publicOnly:{type:'boolean'},personalDataVisible:{type:'boolean'},authenticationVisible:{type:'boolean'}},required:['app','page','symbol','publicOnly','personalDataVisible','authenticationVisible'],additionalProperties:false}}
];
let runs=0;
async function call(name,args){
  if(name==='strategy_candidates'){exactKeys(args,[]);return {candidates:candidates(),modelCalled:false};}
  if(name==='research_synthetic'){
    exactKeys(args,['seed']);if(++runs>20)throw Error('Session research budget exhausted: 20 attempts');
    const report=await runResearch({seed:args.seed});await appendJournal(journal,{type:'research_completed',report});
    return {frozen:report.frozen,candidates:report.candidates,test:{netReturn:report.test.netReturn,maxDrawdown:report.test.maxDrawdown,costPaid:report.test.costPaid},evidence:report.evidence,journal:'runtime/mcp-experiments.jsonl'};
  }
  if(name==='prize_simulate'){exactKeys(args,['pool','weights']);return allocatePrize(args.pool,args.weights);}
  if(name==='phone_market_plan')return planMarketObservation(args);
  throw Error('Unknown tool');
}
async function dispatch(req){
  if(req.id===undefined)return;
  let result;
  if(req.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fanshi-research',version:'0.1.0'}};
  else if(req.method==='ping')result={};
  else if(req.method==='tools/list')result={tools:definitions};
  else if(req.method==='tools/call'){
    try{const value=await call(req.params?.name,req.params?.arguments||{});result={content:[{type:'text',text:JSON.stringify(value)}],isError:false};}
    catch(error){await appendJournal(journal,{type:'tool_failed',tool:definitions.some(x=>x.name===req.params?.name)?req.params.name:'unknown',reason:error.message,at:new Date().toISOString()});result={content:[{type:'text',text:error.message}],isError:true};}
  }else return {jsonrpc:'2.0',id:req.id,error:{code:-32601,message:'Method not found'}};
  return {jsonrpc:'2.0',id:req.id,result};
}
let pending='',queue=Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  pending+=chunk;
  if(Buffer.byteLength(pending)>131072){process.stderr.write('Input limit exceeded\n');process.exit(1);}
  let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);if(!line.trim())continue;queue=queue.then(async()=>{let output;try{output=await dispatch(JSON.parse(line));}catch{output={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid request'}};}if(output)process.stdout.write(JSON.stringify(output)+'\n');});}
});

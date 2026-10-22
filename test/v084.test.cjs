const test=require('node:test'),assert=require('node:assert/strict');
const {geminiUsage}=require('../app/usage/gemini-usage.cjs');
test('Gemini parses tabular and spaced five-hour quotas without inventing absent windows',()=>{
 const old=geminiUsage('Gemini Models\tFive Hour Limit Remaining\t42%\t2026-10-21T12:00:00Z');
 assert.equal(old.fiveHour.remaining,42);assert.equal(old.blocked,false);
 const table=geminiUsage('│ Gemini Models │ 5-hour Limit Remaining │ 0% │ 2026-10-21T12:00:00Z │');
 assert.equal(table.fiveHour.remaining,0);assert.equal(table.blocked,true);
 const weekly=geminiUsage('Gemini Models\tWeekly Limit Remaining\t97%\t2026-10-27T14:07:52Z');
 assert.equal(weekly.fiveHour,null);assert.equal(weekly.weekly.remaining,97);assert.deepEqual(weekly.missingWindows,['fiveHour']);
 assert.equal(geminiUsage('Gemini Models\tWeekly Limit Remaining\t0%').blocked,true);
 assert.equal(geminiUsage('Gemini Models\tFive Hour Limit Remaining\t101%').fiveHour,null);
});

test('Gemini JSON reads explicit five-hour buckets and does not relabel weekly data',()=>{
 const data={command:{data:{groups:[{name:'Gemini Models',buckets:[{window:'5h',remaining_fraction:0.625,reset_time:'2026-10-21T16:00:00Z'},{window:'weekly',remaining_fraction:.97}]}]}}};
 assert.equal(geminiUsage(JSON.stringify(data)).fiveHour.remaining,62.5);
 assert.equal(geminiUsage(data.command.data).weekly.remaining,97);
 data.command.data.groups[0].buckets[0].disabled=true;assert.equal(geminiUsage(data.command.data).fiveHour,null);
});

test('Gemini background reads use cache without starting any provider process',async()=>{
 const {Providers}=require('../app/ai/providers.cjs');const provider=Object.create(Providers.prototype);
 provider.spec=()=>{throw Error('must not launch')};const value=await provider.usage(false);assert.equal(value.fiveHour,null);
 provider.quotaCache={provider:'gemini',fiveHour:{remaining:62},updatedAt:1};assert.equal(await provider.usage(false),provider.quotaCache);
});

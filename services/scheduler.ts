import { useScheduleStore, type ScheduledDial } from '../store/useScheduleStore';
import { useActivityStore } from '../store/useActivityStore';
import { manualDeliver } from './smsAutomation';
const CHECK_INTERVAL_MS=30000; let intervalHandle:ReturnType<typeof setInterval>|null=null; let running=false;
export function startSchedulerLoop(){if(intervalHandle)return;intervalHandle=setInterval(()=>void runDueSchedules(),CHECK_INTERVAL_MS);void runDueSchedules();}
export function stopSchedulerLoop(){if(intervalHandle){clearInterval(intervalHandle);intervalHandle=null;}}
async function runDueSchedules(){if(running)return;running=true;try{const log=useActivityStore.getState().addLog;const now=Date.now();const due=useScheduleStore.getState().items.filter(i=>i.active&&(i.limit==null||i.runsCompleted<i.limit)&&new Date(i.runAt).getTime()<=now);for(const item of due){log('info',`Running scheduled dial "${item.label}"`);const result=await manualDeliver({phone:item.phone,amount:item.amount,network:item.network});useScheduleStore.getState().recordRun(item.id,result.ok?'Queued':result.reason??'Failed to queue',computeNextRun(item));}}finally{running=false;}}
function computeNextRun(item:ScheduledDial){if(item.recurrence==='once')return null;const base=new Date(item.runAt).getTime();return new Date(base+(item.recurrence==='daily'?86400000:604800000)).toISOString();}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export type ScheduleRecurrence = 'once' | 'daily' | 'weekly';
export type ScheduledDial = { id:string; label:string; phone:string; amount:number; network:'safaricom'|'airtel'; runAt:string; recurrence:ScheduleRecurrence; limit:number|null; runsCompleted:number; active:boolean; createdAt:string; lastRunAt:string|null; lastRunResult:string|null; };
type State={items:ScheduledDial[]; addSchedule:(input:{label:string;phone:string;amount:number;network:'safaricom'|'airtel';runAt:string;recurrence:ScheduleRecurrence;limit:number|null})=>string; removeSchedule:(id:string)=>void; setActive:(id:string,active:boolean)=>void; recordRun:(id:string,resultText:string,nextRunAt:string|null)=>void};
export const useScheduleStore=create<State>()(persist((set)=>({
 items:[],
 addSchedule:({label,phone,amount,network,runAt,recurrence,limit})=>{const id=`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;set(s=>({items:[{id,label,phone,amount,network,runAt,recurrence,limit,runsCompleted:0,active:true,createdAt:new Date().toISOString(),lastRunAt:null,lastRunResult:null},...s.items]}));return id;},
 removeSchedule:id=>set(s=>({items:s.items.filter(i=>i.id!==id)})),
 setActive:(id,active)=>set(s=>({items:s.items.map(i=>i.id===id?{...i,active}:i)})),
 recordRun:(id,resultText,nextRunAt)=>set(s=>({items:s.items.map(it=>{if(it.id!==id)return it;const runsCompleted=it.runsCompleted+1;const limitReached=it.limit!=null&&runsCompleted>=it.limit;return {...it,runsCompleted,lastRunAt:new Date().toISOString(),lastRunResult:resultText,runAt:nextRunAt??it.runAt,active:nextRunAt!=null&&!limitReached};})}))
}),{name:'webazi-schedule-store',storage:{getItem:async n=>{const v=await AsyncStorage.getItem(n);return v?JSON.parse(v):null;},setItem:async(n,v)=>AsyncStorage.setItem(n,JSON.stringify(v)),removeItem:async n=>AsyncStorage.removeItem(n)}}));

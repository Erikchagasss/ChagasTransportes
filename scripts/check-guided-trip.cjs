const fs=require('fs'),ts=require('typescript'),Module=require('module'),assert=require('node:assert/strict');
const m=new Module('guided-trip');m._compile(ts.transpileModule(fs.readFileSync('lib/guided-trip.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,'guided-trip.js');
const {nextGuidedStep,tripProgress,addressNavigation,orderedDailyTrips,orderedStops,tripScheduleTime,timeValue,nextActionableTrip}=m.exports;
const base={id:'a',status:'pending',employee_name:'Ana',employee_phone:null,pickup_order:1,pickup_address:'Casa A',dropoff_address:'Empresa',arrived_at:null,boarded_at:null,dropoff_arrived_at:null,dropped_off_at:null,scheduled_start:'06:00',scheduled_end:'16:00',notes:''};
const b={...base,id:'b',employee_name:'Bia',pickup_order:2,pickup_address:'Casa B'};
let step=nextGuidedStep([b,base],'ida');assert.equal(step.stops[0].id,'a');assert.equal(step.kind,'pickup');assert.equal(step.arrived,false);
step=nextGuidedStep([{...base,status:'boarded',boarded_at:'2026-11-16T08:00:00Z'},b],'ida');assert.equal(step.stops[0].id,'b'); // Não entrega antes da última busca.
const boarded=[base,b].map(s=>({...s,status:'boarded',boarded_at:'2026-11-16T08:00:00Z'}));
step=nextGuidedStep(boarded,'ida');assert.equal(step.kind,'dropoff');assert.equal(step.stops.length,2);
step=nextGuidedStep([boarded[0],{...boarded[1],dropoff_address:'Outra empresa'}],'ida');assert.equal(step.stops.length,1);
const back=[base,b].map(s=>({...s,pickup_address:'Empresa',dropoff_address:s.pickup_address}));
step=nextGuidedStep(back,'volta');assert.equal(step.stops.length,2);assert.equal(step.kind,'pickup');
step=nextGuidedStep(back.map(s=>({...s,status:'boarded',boarded_at:'2026-11-16T20:00:00Z'})),'volta');assert.equal(step.stops.length,1);assert.equal(step.address,'Casa A');
assert.equal(nextGuidedStep([{...base,status:'absent'}, {...b,status:'boarded',dropped_off_at:'2026-11-16T21:00:00Z'}],'ida'),null);
assert.equal(nextGuidedStep([],'ida'),null);
assert.equal(nextGuidedStep([{...back[0],arrived_at:'2026-11-16T08:00:00Z'},back[1]],'volta').arrived,false);
assert.equal(nextGuidedStep([{...base,pickup_address:null},{...b,pickup_address:null}],'volta').stops.length,1);
assert.deepEqual(tripProgress([{...base,status:'absent'}, {...b,status:'boarded',dropped_off_at:'2026-11-16T21:00:00Z'}]),{total:2,boarded:1,delivered:1,absent:1,resolved:2});
assert.ok(addressNavigation('Rua A & B, nº 10').google.includes(encodeURIComponent('Rua A & B, nº 10')));
console.log('PASS: sequência ida/volta, embarque em grupo, destinos alterados, ausências, retomada e links de navegação.');

const late={...b,scheduled_start:'15:00',scheduled_end:'18:00',pickup_order:0};
assert.equal(orderedStops([late,base],'ida')[0].id,'a');
assert.equal(nextGuidedStep([{...base,status:'boarded',boarded_at:'2026-11-16T08:00:00Z'},late],'ida').kind,'dropoff');
const earlyReturn={...base,pickup_address:'Empresa',dropoff_address:'Casa A',scheduled_end:'16:00'};
const lateReturn={...late,pickup_address:'Empresa',dropoff_address:'Casa B',scheduled_end:'18:00'};
assert.equal(nextGuidedStep([lateReturn,earlyReturn],'volta').stops.length,1);
assert.equal(nextGuidedStep([lateReturn,earlyReturn],'volta').stops[0].id,'a');
const daily=[
 {id:'entry23',period:'ida',status:'planned',trip_date:'2026-11-16',scheduled_time:'23:00',trip_stops:[]},
 {id:'exit16',period:'volta',status:'planned',trip_date:'2026-11-16',scheduled_time:'16:48',trip_stops:[]},
 {id:'entry15',period:'ida',status:'planned',trip_date:'2026-11-16',scheduled_time:'15:00',trip_stops:[]},
 {id:'entry7',period:'ida',status:'planned',trip_date:'2026-11-16',scheduled_time:'07:00',trip_stops:[]},
 {id:'unknown',period:'ida',status:'planned',trip_date:'2026-11-16',scheduled_time:null,trip_stops:[]},
];
assert.deepEqual(orderedDailyTrips(daily).map(t=>t.id),['entry7','entry15','exit16','entry23','unknown']);
assert.equal(orderedDailyTrips([{...daily[0],status:'in_progress'},...daily.slice(1)])[0].id,'entry23');
assert.equal(orderedDailyTrips([{...daily[3],status:'completed'},daily[0]])[0].id,'entry23');
assert.equal(nextActionableTrip([{...daily[0],status:'completed'},daily[1],daily[2],daily[3]]).id,'entry7');
assert.equal(nextActionableTrip([{...daily[0],status:'in_progress'},daily[1],daily[3]]).id,'entry23');
assert.equal(nextActionableTrip(daily.map(t=>({...t,status:'completed'}))),null);
assert.equal(tripScheduleTime({id:'x',period:'volta',status:'planned',trip_date:'2026-11-16',trip_stops:[{scheduled_start:'06:00',scheduled_end:'18:00'},{scheduled_start:'07:00',scheduled_end:'16:00'}]}),'16:00');
assert.equal(timeValue('99:99'),Infinity);
console.log('PASS: ordem cronológica entre ida/volta, paradas por turno, entrega antes da busca posterior e horários ausentes ao final.');

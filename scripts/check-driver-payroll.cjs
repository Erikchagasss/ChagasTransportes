const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');
const Module = require('module');
const code = ts.transpileModule(fs.readFileSync('lib/driver-payroll.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const loaded = new Module('driver-payroll');
loaded._compile(code,'driver-payroll.js');
const {summarizeDriver,monthRange} = loaded.exports;
const salaries = [
  {driver_id:'a',effective_month:'2026-10-01',monthly_salary:2500},
  {driver_id:'a',effective_month:'2026-12-01',monthly_salary:3000},
  {driver_id:'b',effective_month:'2026-11-01',monthly_salary:1000},
];
const trip = {id:'1',driver_id:'a',trip_date:'2026-11-10',status:'completed',distance_km:100,fuel_cost:40,distance_source:'directions_api'};
let result = summarizeDriver('a','2026-11',salaries,[trip,{...trip,id:'2',distance_km:150}, {...trip,id:'3',status:'planned',distance_km:999}, {...trip,id:'4',driver_id:'b',distance_km:999}]);
assert.equal(result.salary,2500);assert.equal(result.km,250);assert.equal(result.salaryPerKm,10);assert.equal(result.completedTrips,2);assert.equal(result.daysWorked,1);
result = summarizeDriver('a','2026-11',salaries,[trip,{...trip,id:'2',distance_km:null}]);
assert.equal(result.salary,2500);assert.equal(result.missingDistance,1);assert.equal(result.salaryPerKm,null);
assert.equal(summarizeDriver('a','2026-12',salaries,[]).salary,3000);
assert.equal(summarizeDriver('a','2026-11',salaries,[]).salary,2500); // Sem rateio por corridas ou dias.
assert.equal(summarizeDriver('a','2026-09',salaries,[]).salary,null);
assert.equal(summarizeDriver('a','2026-11',salaries,[{...trip,distance_km:0,distance_source:'none'}]).missingDistance,1);
assert.equal(summarizeDriver('a','2026-11',salaries,[{...trip,distance_source:'legacy'}]).legacyDistance,1);
assert.equal(summarizeDriver('a','2026-11',salaries,[{...trip,trip_date:'2026-10-31'}]).km,0);
assert.deepEqual(monthRange('2028-02'),{from:'2028-02-01',to:'2028-02-29'});
assert.throws(()=>monthRange('2026-13'));
console.log('PASS: salário fixo, vigência, isolamento por motorista/mês, km ausentes, custo por km e fevereiro bissexto.');

import { brazilPoint } from "./location-point";
export interface GeocodeCandidate {
  lat: string; lon: string; display_name: string;
  address?: Record<string,string>;
  matchquality?: {matchcode?:string;matchtype?:string;matchlevel?:string};
}
export const fold = (s:string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const STATES: Record<string,string> = {ac:"acre",al:"alagoas",ap:"amapa",am:"amazonas",ba:"bahia",ce:"ceara",df:"distrito federal",es:"espirito santo",go:"goias",ma:"maranhao",mt:"mato grosso",ms:"mato grosso do sul",mg:"minas gerais",pa:"para",pb:"paraiba",pr:"parana",pe:"pernambuco",pi:"piaui",rj:"rio de janeiro",rn:"rio grande do norte",rs:"rio grande do sul",ro:"rondonia",rr:"roraima",sc:"santa catarina",sp:"sao paulo",se:"sergipe",to:"tocantins"};
export function preciseCandidate(query:string,c:GeocodeCandidate): boolean {
  const point={lat:Number(c.lat),lng:Number(c.lon)};
  if(!brazilPoint(point)) return false;
  const a=c.address || {};
  if(a.country_code && a.country_code.toLowerCase() !== "br") return false;
  const city=a.city || a.town || a.municipality || a.village;
  const input=fold(query);
  // Não aceita o centro de uma cidade, uma rua homônima em outra cidade, nem número aproximado.
  if(!city || !(` ${input} `).includes(` ${fold(city)} `)) return false;
  const uf=query.match(/(?:\s*[-/]\s*|,\s*)(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i)?.[1]?.toLowerCase();
  if(uf && fold(a.state || "") !== STATES[uf] && !Object.values(a).some(v=>fold(v) === `br ${uf}`)) return false;
  const expectedNumber=query.match(/,\s*(\d+[a-z]?)\b/i)?.[1] || query.match(/\bn[ºo°.]?\s*(\d+[a-z]?)\b/i)?.[1];
  if(!expectedNumber || fold(a.house_number || "") !== fold(expectedNumber)) return false;
  const road=a.road || a.pedestrian || a.residential;
  const expectedRoad=query.split(",")[0].trim();
  if(!road || fold(road) !== fold(expectedRoad)) return false;
  const postal=query.match(/\b(\d{5})-?(\d{3})\b/);
  if(postal && a.postcode && a.postcode.replace(/\D/g,"") !== postal[1]+postal[2]) return false;
  const quality=c.matchquality;
  if(quality?.matchcode && quality.matchcode !== "exact") return false;
  if(quality?.matchtype && quality.matchtype !== "point") return false;
  if(quality?.matchlevel && !["venue","building"].includes(quality.matchlevel)) return false;
  return true;
}

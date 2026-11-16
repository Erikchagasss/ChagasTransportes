export type UserRole = "admin" | "driver";
export type ContractStatus = "active" | "paused" | "ended";
export type TripStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type StopStatus = "pending" | "boarded" | "absent";
export type ShiftType = "fixed" | "12x36";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  cpf: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  driver_id: string | null;
  plate: string;
  model: string | null;
  km_per_liter: number;
  fuel_price: number;
  monthly_depreciation: number;
  active: boolean;
}

export interface Contract {
  id: string;
  company_name: string;
  company_cnpj: string | null;
  company_representative: string | null;
  company_address: string;
  company_logo_url: string | null;
  company_lat: number | null;
  company_lng: number | null;
  // Empresa de destino, quando diferente do contratante (ex: terceirização
  // — contratante paga, mas funcionárias trabalham em outro endereço)
  work_site_name: string | null;
  work_site_address: string | null;
  work_site_lat: number | null;
  work_site_lng: number | null;
  monthly_value: number;
  status: ContractStatus;
  driver_pct: number | null;
  tax_pct: number | null;
  margin_pct: number;
  other_fixed_costs: number;
  work_days_per_month: number;
  current_estimated_distance_km: number | null;
  suggested_monthly_value: number | null;
  value_variance_pct: number | null;
  needs_price_review: boolean;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface Employee {
  id: string;
  contract_id: string;
  full_name: string;
  phone: string | null;
  address: string;
  address_lat: number | null;
  address_lng: number | null;
  active: boolean;
  shift_type: ShiftType;
  work_weekdays: number[];
  shift_anchor_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
}

export interface Route {
  id: string;
  contract_id: string;
  driver_id: string;
  vehicle_id: string | null;
  name: string;
  weekdays: number[];
  active: boolean;
}

export interface Trip {
  id: string;
  route_id: string;
  driver_id: string;
  contract_id: string;
  trip_date: string;
  status: TripStatus;
  started_at: string | null;
  completed_at: string | null;
  distance_km: number | null;
  distance_source?: "directions_api" | "straight_line_estimate" | "none" | "legacy";
  fuel_cost: number | null;
}

export interface TripStop {
  id: string;
  trip_id: string;
  employee_id: string;
  status: StopStatus;
  boarded_at: string | null;
  arrived_at: string | null;
  dropoff_arrived_at: string | null;
  dropped_off_at: string | null;
  notes: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  employee_name: string | null;
  employee_phone: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  pickup_order: number;
}

export interface LegalTemplate {
  id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// Placeholder mínimo compatível com o generic do supabase-js.
// Recomendo gerar o tipo completo depois com:
// npx supabase gen types typescript --project-id SEU_ID > types/database.ts
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      vehicles: { Row: Vehicle; Insert: Partial<Vehicle>; Update: Partial<Vehicle> };
      contracts: { Row: Contract; Insert: Partial<Contract>; Update: Partial<Contract> };
      employees: { Row: Employee; Insert: Partial<Employee>; Update: Partial<Employee> };
      routes: { Row: Route; Insert: Partial<Route>; Update: Partial<Route> };
      trips: { Row: Trip; Insert: Partial<Trip>; Update: Partial<Trip> };
      trip_stops: { Row: TripStop; Insert: Partial<TripStop>; Update: Partial<TripStop> };
    };
  };
}

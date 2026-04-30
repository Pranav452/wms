export interface RS1_KPI {
  RECEIPT_QTY:       number
  ISSUE_QTY:         number
  RETURN_QTY:        number
  BAL_QTY:           number
  PO_QTY:            number
  UNFULFILLED_PO_QTY: number   // PO_QTY - ISSUE_QTY = still owed
  CONTAINER_COUNT:   number
  SKU_COUNT:         number
  AGING_90_PLUS:     number
  MRP_DONE_QTY:      number
  MRP_PENDING_QTY:   number
}

export interface RS2_ShipType {
  SHIPMENTTYPE:    string
  CONTAINER_COUNT: number
  SKU_COUNT:       number
  RECEIPT_QTY:     number
  BAL_QTY:         number
}

export interface RS3_StockDetail {
  SRNO:        number
  EAN:         string
  RECEIPT_QTY: number
  ISSUE_QTY:   number
  RETURN_QTY:  number
  BAL_QTY:     number
  PO_QTY:      number
  OLDEST_GRN:  string
  AGING_DAYS:  number
}

export interface RS4_AgingBucket {
  BUCKET:  string
  CNT:     number
  BAL_QTY: number
}

export interface RS5_MrpPending {
  EAN:         string
  PENDING_QTY: number
}

export interface RS6_MonthlyTrend {
  MONTH_KEY:   string
  RECEIPT_QTY: number
}

export interface RS7_LabelStatus {
  FP:        number
  PENDING:   number
  INPROCESS: number
}

export interface RS8_DailyDispatch {
  PROCESS_DATE: string
  DISPATCH_QTY: number
}

export interface RS9_Backlog {
  Pending_Qty:    number
  Daily_Capacity: number
  Estimated_Days: number
}

export interface RS10_ClientDispatch {
  CLIENT:       string
  DISPATCH_QTY: number
  GIN_COUNT:    number
}

export interface RS11_POvsDispatch {
  CLIENT:         string
  PO_QTY:         number
  DISPATCHED_QTY: number
  BALANCE_QTY:    number
}

export interface RS12_POTracking {
  PONO:               string
  CLIENT:             string
  PO_QTY:            number
  DISPATCHED:        number
  BALANCE:           number
  SKU_COUNT:         number
  LAST_DISPATCH_DATE: string
  GIN_NOS:           string
}

export interface RS13_Container {
  CONTAINERNO:     string
  SHIPMENTTYPE:    string
  FIRST_GRN_DATE:  string
  LAST_GRN_DATE:   string
  SKU_COUNT:       number
  RECEIPT_QTY:     number
  AGING_DAYS:      number
  MRP_PENDING_QTY: number
}

export interface RS14_ClientReceipt {
  CLIENT:      string
  RECEIPT_QTY: number
  PONO_COUNT:  number
  SKU_COUNT:   number
}

export interface RS15_MrpDaily {
  COMPLETED_DATE: string
  LABELS_DONE:    number
  UNITS_LABELLED: number
}

export interface RS16_MrpPendingContainer {
  CONTAINERNO:    string
  SHIPMENTTYPE:   string
  PENDING_TASKS:  number
  PENDING_QTY:    number
  ASSIGNED_SINCE: string | null
  DAYS_PENDING:   number | null
}

export interface RS17_ArticleType {
  ARTICLETYPE: string
  SKU_COUNT:   number
  PO_QTY:      number
  GENDER_MIX:  string
}

export interface RS18_DeliveryAgent {
  DELAGENT:     string
  GIN_COUNT:    number
  DISPATCH_QTY: number
  LAST_DISPATCH: string
}

export interface RS19_GRNDaily {
  GRN_DATE:   string
  GRN_COUNT:  number
  CONTAINERS: number
  UNITS_IN:   number
}

export interface RS20_POValue {
  ARTICLETYPE:      string
  PO_QTY:           number
  TOTAL_MRP_VALUE:  number
  AVG_MRP:          number
  TOTAL_LANDED:     number
}

export interface DashboardData {
  kpi:                RS1_KPI | null
  shipTypes:          RS2_ShipType[]
  stockDetail:        RS3_StockDetail[]
  agingBuckets:       RS4_AgingBucket[]
  mrpPending:         RS5_MrpPending[]
  monthlyTrend:       RS6_MonthlyTrend[]
  labelStatus:        RS7_LabelStatus | null
  dailyDispatch:      RS8_DailyDispatch[]
  backlog:            RS9_Backlog | null
  clientDispatch:     RS10_ClientDispatch[]
  poVsDispatch:       RS11_POvsDispatch[]
  poTracking:         RS12_POTracking[]
  containers:         RS13_Container[]
  clientReceipt:      RS14_ClientReceipt[]
  mrpDaily:           RS15_MrpDaily[]
  mrpPendingContainers: RS16_MrpPendingContainer[]
  articleTypes:       RS17_ArticleType[]
  deliveryAgents:     RS18_DeliveryAgent[]
  grnDaily:           RS19_GRNDaily[]
  poValue:            RS20_POValue[]
  asOnDate:           string
  fetchedAt:          string
}

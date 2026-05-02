// Salesforce標準のattributes型
export interface SalesforceAttributes {
  type: string;
  url: string;
}

// EntityDefinition (objects.json)
export interface EntityDefinition {
  attributes: SalesforceAttributes;
  QualifiedApiName: string;
  Label: string;
  DeveloperName: string;
}

// FieldDefinition (fields.json内の各フィールド)
export interface FieldDefinition {
  attributes: SalesforceAttributes;
  QualifiedApiName: string;
  Label: string;
  DataType: string;
  Length: number;
}

// オブジェクトごとの項目一覧 (fields.json)
export interface ObjectFields {
  objectName: string;
  fields: FieldDefinition[];
}

// FlowDefinition (flowDefinitions.json)
export interface FlowDefinition {
  attributes: SalesforceAttributes;
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  ActiveVersionId?: string;
  LatestVersionId?: string;
}

// FlowRecord (flows.json)
export interface FlowRecord {
  attributes: SalesforceAttributes;
  Id: string;
  Name: string;
  FlowLabel: string;
  ApiName: string;
  ProgressStatus: string;
  IsPaused: boolean;
  FlowType: string;
  FlowDefinition: string | null;
  CreatedDate: string;
  LastModifiedDate: string;
}

// CronJobDetail (cronJobs.json内のネストオブジェクト)
export interface CronJobDetail {
  attributes: SalesforceAttributes;
  Name: string;
  JobType: string;
}

// CronTrigger (cronJobs.json)
export interface CronTrigger {
  attributes: SalesforceAttributes;
  Id: string;
  CronExpression: string;
  NextFireTime: string;
  PreviousFireTime: string;
  State: string;
  CronJobDetail: CronJobDetail;
}

// Salesforceクエリ結果の汎用型
export interface SalesforceQueryResult<T> {
  status: number;
  result: {
    records: T[];
    totalSize: number;
    done: boolean;
  };
  warnings?: string[];
}

// objects.json の型
export type ObjectsQueryResult = SalesforceQueryResult<EntityDefinition>;

// flowDefinitions.json の型
export type FlowDefinitionsQueryResult = SalesforceQueryResult<FlowDefinition>;

// flows.json の型
export type FlowsQueryResult = SalesforceQueryResult<FlowRecord>;

// cronJobs.json の型
export type CronJobsQueryResult = SalesforceQueryResult<CronTrigger>;

// sobject-list.json の型（文字列の配列）
export type SObjectList = string[];

// fields.json の型（ObjectFieldsの配列）
export type FieldsData = ObjectFields[];

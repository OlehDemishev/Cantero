import type { DocumentedRule } from "./harness";

/**
 * Request rules for the providers that publish prose + examples rather than a machine-readable
 * schema, each written down from the page named in `source` (retrieved 2026-09-21). When a provider
 * changes its API, update the rule from the page — never from what our code currently sends.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MS_SCHEDULE_API = "learn.microsoft.com/dynamics365/project-operations/project-management/schedule-api-preview";
const MS_POWER_AUTOMATE = "learn.microsoft.com/dynamics365/project-operations/project-management/scheduling-apis-powerautomate";

export const msProject = {
  createProjectV1: {
    source: MS_SCHEDULE_API,
    required: ["Project.@odata.type", "Project.msdyn_subject"],
    allowedTopLevel: ["Project"],
  } satisfies DocumentedRule,
  createOperationSetV1: {
    source: MS_SCHEDULE_API,
    required: ["ProjectId", "Description"],
    allowedTopLevel: ["ProjectId", "Description"],
  } satisfies DocumentedRule,
  pssCreateV1: {
    source: MS_POWER_AUTOMATE,
    required: ["Entity", "OperationSetId"],
    allowedTopLevel: ["Entity", "OperationSetId"],
  } satisfies DocumentedRule,
  /** Applied to the `Entity` of a msdyn_PssCreateV1 call that creates a task. */
  taskEntity: {
    source: MS_POWER_AUTOMATE,
    required: ["msdyn_projecttaskid", "msdyn_subject", "msdyn_project@odata.bind", "msdyn_projectbucket@odata.bind"],
    allowedTopLevel: [
      "@odata.type",
      "msdyn_projecttaskid",
      "msdyn_subject",
      "msdyn_project@odata.bind",
      "msdyn_projectbucket@odata.bind",
      "msdyn_start",
      "msdyn_scheduledstart",
      "msdyn_scheduledend",
      "msdyn_effort",
      "msdyn_LinkStatus",
      "msdyn_outlinelevel",
      "msdyn_parenttask@odata.bind",
    ],
    patterns: {
      "msdyn_projecttaskid": GUID,
      "msdyn_project@odata.bind": /^\/msdyn_projects\([0-9a-f-]{36}\)$/i,
      "msdyn_projectbucket@odata.bind": /^\/msdyn_projectbuckets\([0-9a-f-]{36}\)$/i,
    },
  } satisfies DocumentedRule,
  /** Applied to the `Entity` of a msdyn_PssCreateV1 call that creates a bucket. */
  bucketEntity: {
    source: MS_POWER_AUTOMATE,
    required: ["msdyn_projectbucketid", "msdyn_name", "msdyn_project@odata.bind"],
    allowedTopLevel: ["@odata.type", "msdyn_projectbucketid", "msdyn_name", "msdyn_project@odata.bind"],
    patterns: { "msdyn_projectbucketid": GUID },
  } satisfies DocumentedRule,
  executeOperationSetV1: {
    source: MS_SCHEDULE_API,
    required: ["OperationSetId"],
    allowedTopLevel: ["OperationSetId"],
  } satisfies DocumentedRule,
  /** "Each OperationSet can only have up to 200 operations." */
  operationSetLimit: 200,
};

const LEXWARE = "developers.lexware.io/docs (Invoices / Contacts endpoints)";
export const lexware = {
  baseUrl: "https://api.lexware.io/v1",
  createInvoice: {
    source: LEXWARE,
    required: [
      "voucherDate",
      "address.contactId",
      "lineItems[].type",
      "lineItems[].name",
      "lineItems[].quantity",
      "lineItems[].unitName",
      "lineItems[].unitPrice.currency",
      "lineItems[].unitPrice.netAmount",
      "lineItems[].unitPrice.taxRatePercentage",
      "totalPrice.currency",
      "taxConditions.taxType",
      "shippingConditions.shippingType",
      "shippingConditions.shippingDate",
    ],
    enums: {
      "lineItems[].type": ["custom", "material", "service", "text"],
      "taxConditions.taxType": ["gross", "net", "vatfree", "intraCommunitySupply", "constructionService13b", "externalService13b", "thirdPartyCountryService", "thirdPartyCountryDelivery", "photovoltaicEquipment"],
      "shippingConditions.shippingType": ["service", "serviceperiod", "delivery", "deliveryperiod", "none"],
    },
  } satisfies DocumentedRule,
  createContact: {
    source: LEXWARE,
    required: ["roles", "company.name"],
    patterns: { version: /^0$/ },
  } satisfies DocumentedRule,
};

const APS_ISSUES = "aps.autodesk.com/en/docs/acc/v1/reference/http/issues-issues-POST";
export const autodesk = {
  createIssue: {
    source: APS_ISSUES,
    required: ["title", "issueSubtypeId", "status"],
    enums: { status: ["draft", "open", "pending", "in_progress", "completed", "in_review", "not_approved", "in_dispute", "closed"] },
    patterns: { issueSubtypeId: GUID, title: /^[\s\S]{1,100}$/, description: /^[\s\S]{0,1000}$/ },
  } satisfies DocumentedRule,
  /** "…removing the b. prefix" from the Data Management project id. */
  projectIdInPath: /^[0-9a-f-]{36}$/i,
};

const QBO = "developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities";
export const quickbooks = {
  createInvoice: {
    source: `${QBO}/invoice`,
    required: ["CustomerRef.value", "Line[].Amount", "Line[].DetailType", "Line[].SalesItemLineDetail.ItemRef.value", "CurrencyRef.value"],
    enums: { "Line[].DetailType": ["SalesItemLineDetail", "GroupLineDetail", "DescriptionOnly", "DiscountLineDetail", "SubTotalLineDetail"] },
  } satisfies DocumentedRule,
  createBill: {
    source: `${QBO}/bill`,
    required: ["VendorRef.value", "Line[].Amount", "Line[].DetailType", "Line[].AccountBasedExpenseLineDetail.AccountRef.value", "CurrencyRef.value"],
    enums: { "Line[].DetailType": ["AccountBasedExpenseLineDetail", "ItemBasedExpenseLineDetail"] },
  } satisfies DocumentedRule,
  createNameListEntity: {
    source: `${QBO}/customer, /vendor`,
    required: ["DisplayName"],
  } satisfies DocumentedRule,
};

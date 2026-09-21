# Provider contract tests

Unit tests for the integrations mock `fetch` with responses someone wrote to match what the code
already expects, so a wrong field name, a missing required field or a retired host passes them
every time. These tests pin each integration to what the **provider publishes** instead.

| Provider | Contract source | How it's checked |
| --- | --- | --- |
| Sage Intacct Construction | OpenAPI, `specs/intacct-construction.subset.json` | `openApiViolations` (JSON Schema + no undefined/readOnly fields) |
| DocuSign eSignature v2.1 | Swagger, `specs/docusign-esignature-v2.1.subset.json` | `openApiViolations` |
| Xero Accounting | OpenAPI, `specs/xero-accounting.subset.json` | `openApiViolations`, plus prose-only rules (IsSupplier can't be set) |
| MS Project (Project for the Web) | Microsoft Learn: Project schedule APIs + Power Automate walkthrough | `documented-rules.ts` |
| Lexware Office (lexoffice) | developers.lexware.io | `documented-rules.ts` |
| Autodesk ACC Issues | aps.autodesk.com POST issues / GET issue-types | `documented-rules.ts` |
| QuickBooks Online | developer.intuit.com entity pages (Invoice, Bill, Customer, Vendor) | `documented-rules.ts` |

`fakeProvider` answers only the routes a test lists and throws on anything else, so an
undocumented endpoint can't be called silently. Every spec file includes a check that the rules
reject what the connector used to send before it was fixed — proof the rule has teeth.

## Specs

`specs/*.json` are subsets of the providers' own files: only the operations we call and every
schema they reference, with annotation keywords (`description`, `example`, `title`, `summary`)
dropped. Properties that happen to have those names are kept. Each file's `info` block records its
source URL and retrieval date.

To refresh one, download the provider's spec again, cut the same operations, and rerun these
tests. When one fails, the provider changed something: fix the connector, not the fixture.

## What this doesn't prove

These tests pin the **documented** contract. None of these integrations has been run against a
live tenant from here (that needs each provider's app registration and a sandbox account), so
behavior the docs don't state — rate limits in practice, permission errors, per-tenant
configuration such as which Intacct item or ACC issue type exists — still needs one supervised run
per provider.

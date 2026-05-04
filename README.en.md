# sf-viewer

sf-viewer is a tool to retrieve Salesforce organization configuration and visualize it as a design document.

## Use Cases

- **Automatic Design Document Generation**: Export Salesforce configuration as TSV/Markdown
- **Configuration Overview**: View objects, fields, flows, Apex classes in a list
- **Team Sharing**: Share via standalone HTML or Google SpreadSheet
- **Extensibility via Add-ons**: Custom TSV output and HTML customization

## Overview

- Retrieves data from Salesforce organization using Salesforce CLI (`npx sf`)
- On Windows with Git Bash available, `npx sf` is executed via `bash.exe -lc`
- Retrieves: object list, field list, flow definitions, scheduled jobs, etc. (customizable via config.json)
- Output formats: TSV, standalone HTML, Google SpreadSheet (GAS)

## Prerequisites

1. Node.js and npm are installed
2. Set target organization alias in `env.json`
3. Configure `objectBlackList` and `queryJobs` in `config.json`

Example: `env.json`

```json
[
  { "alias": "dev", "isDefault": true },
  { "alias": "dev1" }
]
```

- `alias`: Salesforce organization alias name
- `isDefault`: Default alias to use (set exactly one to true)

Example: `config.json`

```json
{
  "objectBlackList": ["Account", "Contact"],
  "queryJobs": [
    {
      "fileName": "flowDefinitions.json",
      "query": "SELECT Id, DeveloperName, MasterLabel FROM FlowDefinition ORDER BY DeveloperName",
      "tooling": true,
      "label": "FlowDefinition List"
    }
  ]
}
```

`objectBlackList`: Array of object names to exclude from field list retrieval
`queryJobs`: Customize data to retrieve (add/remove/modify queries). By default includes FlowDefinition, FlowRecord, CronTrigger.

## Getting Started

### 1. Install

```bash
npm install
```

### 2. Login to Salesforce CLI

```bash
sf org login web -r [salesforce_url] -a dev
```

You can set any value for alias (-a).

### 3. Configuration

Edit `env.json` and `config.json` (see "Prerequisites" for details).

### 4. Retrieve Object List and Check Blacklist

First, retrieve the object list with `--only-objects` option.

```bash
npx ts-node src/index.ts --only-objects
```

The list of objects to be retrieved will be displayed in the log. If there are objects you want to exclude, add them to `objectBlackList` in `config.json`.

### 5. Retrieve Data and Generate Design Document

After updating the blacklist, run normally.

```bash
# Use default alias
npx ts-node src/index.ts

# Specify alias explicitly
npx ts-node src/index.ts dev1
```

### 6. Open Standalone HTML

Open `standaloneHtml/viewer.html` in a browser to view the design document.

---

## Additional Features

### Sync to Google SpreadSheet

1. Upload `out_designDoc/` to a Google Drive folder
2. Open Google Apps Script project (paste `gas/index.gs` and `gas/config.gs`)
3. Edit settings in `gas/config.gs` (DRIVE_FOLDER_ID, SPREADSHEET_ID)
4. Run `run()` function (error if settings are not edited)

Each TSV file writes metadata (alias, retrievedAt, label, etc.) from row 1, followed by headers and data.

## Output Files

All output is saved to `output/` directory.

- `output/objects.json` - Retrieved object list
- `output/fields.json` - Retrieved field list
- `output/sobject-list.json` - Retrieved sObject list
- `output/flowDefinitions.json` - Retrieved FlowDefinition list
- `output/flows.json` - Retrieved FlowRecord list
- `output/cronJobs.json` - Retrieved CronTrigger list

## Design Document (TSV)

Design documents are saved in `out_designDoc/` directory.

- `out_designDoc/fields.tsv` - Field list
- `out_designDoc/meta.json` - Metadata (alias, retrievedAt, queryJobs)
- `out_designDoc/flowDefinitions.tsv` - FlowDefinition list
- `out_designDoc/flows.tsv` - Flow list
- `out_designDoc/cronJobs.tsv` - CronTrigger list

## Run Separately

- Data retrieval only: `SF_ALIAS=dev npx ts-node src/retrieveData.ts`
- Design document generation only: `npx ts-node src/generateDesignDoc.ts` (generates both TSV and standalone HTML)

## Standalone HTML

Generates a standalone HTML file with all data embedded into `standaloneHtml/viewer.html` during design document generation. Standalone (uses CDN), opens in any browser.

### HTML Template

HTML template is located at `src/html/viewer.html`. Placeholders:

- `{{PAGE_TITLE}}` - Page title
- `{{VIEWER_CSS}}` - viewer.css content
- `{{VIEWER_JS}}` - viewer.js content
- `{{TSV_DATA}}` - TSV data (JSON)
- `{{MD_DATA}}` - Markdown data (JSON)
- `{{META}}` - Metadata (JSON)
- `TABS` - Tab list (JSON)
- `{{CUSTOM_CSS}}` - htmlCustom addon CSS
- `{{CUSTOM_JS}}` - htmlCustom addon JS

### Source Files

```
src/html/
├── viewer.html   ← HTML template
├── css/
│   └── viewer.css
└── js/
    └── viewer.js
```

## Add-ons

Placing TypeScript files in `addons/` directory will automatically execute them during design document generation.

### Add-on Types

| Prefix | Interface | Execution Time | Purpose |
|--------|-----------|----------------|----------|
| `sample*.ts` | `run(inputData): AddonResult[]` | After TSV generation | Custom TSV/MD generation |
| `designDoc*.ts` | `run(inputData, tabs, meta): {tabs?, title?}` | Before meta.json update | Tab order, title setting |
| `htmlCustom*.ts` | `run(meta): {css?, js?}` | During HTML generation | CSS/JS customization |

### Interfaces

#### Standard Add-on (sample*.ts)
```typescript
type JsonData = { [filename: string]: any };

export function run(inputData: JsonData): AddonResult[] {
  // Return array to generate multiple files
}
```

#### designDoc Add-on (designDoc*.ts)
```typescript
type JsonData = { [filename: string]: any };

export function run(
  inputData: JsonData,
  tabs: string[],
  meta: any
): {
  tabs?: string[];  // Change tab order
  title?: string;   // Change page title
} {}
```

#### HTML Add-on (htmlCustom*.ts)
```typescript
export function run(meta: any): {
  css?: string;  // Custom CSS (added as <style> tag at end)
  js?: string;   // Custom JS (added as <script> tag at end)
} {}
```

### File Naming

- Standard: `{addon_name}_{index}.tsv` (e.g., `myAddon_0.tsv`)
- designDoc: saved to `meta.json`
- htmlCustom: embedded directly into HTML

### Output Location

- Standard add-on: `out_designDoc/`
- On error, processing stops

## Running Tests

```bash
npm test
```

Tests are located in `test/` directory.

## Notes

- Retrieves flow records from `FlowRecord`, not `Flow` object
- On Windows with Git Bash, automatically uses `bash.exe` if present

## QA

### Alias doesn't work even when specified correctly
If you specify alias correctly like `ts-node src/index.ts dev_hoge` but it's not in env.json, it won't work. Please edit env.json.

### Some objects don't appear in Object Definition
Objects listed in `config.json` `objectBlackList` are excluded. This is pre-configured to filter out standard or unnecessary objects. To show an object, remove it from `objectBlackList`.

### How to retrieve data with custom SOQL?
Add your query to `config.json` `queryJobs`.

```json
"queryJobs": [
  {
    "fileName": "myCustom.json",
    "query": "SELECT Id, Name FROM Account",
    "tooling": false,
    "label": "Custom Data"
  }
]
```

Properties:
- `fileName`: Output filename (.json)
- `query`: SOQL to execute
- `tooling`: Use Tooling API if true (default: false)
- `label`: Tab name in design document

### How to add text pages (not just tables) to design document?
You can output Markdown files with add-ons.

```typescript
// addons/myMarkdown.ts
export function run(inputData: JsonData): AddonResult[] {
  return [{
    meta: { label: "Text Page" },
    type: 'markdown',
    content: "# Heading\n\nText content..."
  }];
}
```

### How to create a table that joins two objects?
You can generate custom TSV with add-ons. Join JSON data and output:

```typescript
// addons/joinObjects.ts
export function run(inputData: JsonData): AddonResult[] {
  const accountData = inputData.account?.data?.records || [];
  const contactData = inputData.contact?.data?.records || [];

  const rows = accountData.map(acc => {
    const contact = contactData.find(c => c.AccountId === acc.Id);
    return [acc.Name, contact?.Email || ""];
  });

  return [{
    meta: { label: "Account and Contact Join" },
    headers: ["Account Name", "Contact Email"],
    rows: rows
  }];
}
```

### How to change tab order in HTMLViewer?
Return tabs with file name array in `designDoc*.ts` add-on.

```typescript
// addons/designDocCustom.ts
export function run(
  inputData: JsonData,
  tabs: string[],
  meta: any
): {
  tabs?: string[];
} {
  return {
    tabs: ["flows.tsv", "fields.tsv", "flowDefinitions.tsv"]
  };
}
```

### How to change title in HTMLViewer?
Return title in `designDoc*.ts` add-on.

```typescript
// addons/designDocCustom.ts
export function run(
  inputData: JsonData,
  tabs: string[],
  meta: any
): {
  title?: string;
} {
  return {
    title: "Custom Title - Design Document"
  };
}
```
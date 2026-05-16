export interface ParsedFrontMatterTSV {
  meta: { [key: string]: string };
  headers: string[];
  rows: string[][];
}

const escapeCell = (value: string): string => {
  return value.replace(/\t/g, "\\t").replace(/\n/g, "\\n");
};

const unescapeCell = (value: string): string => {
  return value.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
};

export class FrontMatterTSV {
  private meta: { [key: string]: string } = {};
  private headers: string[] = [];
  private rows: string[][] = [];

  setMeta(meta: { [key: string]: string }): FrontMatterTSV {
    this.meta = meta;
    return this;
  }

  setHeaders(headers: string[]): FrontMatterTSV {
    this.headers = headers;
    return this;
  }

  ensurePriorityFieldsFirst(): FrontMatterTSV {
    const getBaseName = (h: string): string => {
      return h.includes("\n") ? h.split("\n")[1] : h;
    };

    const priorityKeys = ["Id", "Label", "Name", "ApiName", "Title"];
    const priorityHeaders: string[] = [];
    const priorityIndices: number[] = [];
    const otherIndices: number[] = [];

    for (let i = 0; i < this.headers.length; i++) {
      const base = getBaseName(this.headers[i]);
      const lowerBase = base.toLowerCase();
      const priorityIndex = priorityKeys.findIndex((key) => lowerBase === key.toLowerCase());

      if (priorityIndex >= 0) {
        if (!priorityHeaders[priorityIndex]) {
          priorityHeaders[priorityIndex] = this.headers[i];
          priorityIndices.push(i);
        }
      } else {
        otherIndices.push(i);
      }
    }

    if (priorityIndices.length > 0) {
      const newHeaders = [...priorityHeaders.filter(Boolean), ...otherIndices.map((i) => this.headers[i])];
      const newRows = this.rows.map((row) => {
        const priorityValues = priorityIndices.map((i) => row[i]);
        const otherValues = otherIndices.map((i) => row[i]);
        return [...priorityValues, ...otherValues];
      });
      this.headers = newHeaders;
      this.rows = newRows;
    }

    return this;
  }

  addRow(row: string[]): FrontMatterTSV {
    this.rows.push(row);
    return this;
  }

  addRows(rows: string[][]): FrontMatterTSV {
    this.rows.push(...rows);
    return this;
  }

  toString(): string {
    const metaLines = Object.entries(this.meta).map(
      ([key, value]) => `${key}: ${value}`,
    );
    const metaSection = `---\n${metaLines.join("\n")}\n---`;
    const headerLine = this.headers.map(escapeCell).join("\t");
    const dataLines = this.rows.map((row) =>
      row.map((cell) => escapeCell(cell)).join("\t"),
    );
    const dataSection = [headerLine, ...dataLines].join("\n");
    return `${metaSection}\n${dataSection}`;
  }

  static stringify(
    meta: { [key: string]: string },
    headers: string[],
    rows: string[][],
    ensurePriorityFields?: boolean,
  ): string {
    const doc = new FrontMatterTSV();
    doc.setMeta(meta).setHeaders(headers).addRows(rows);
    if (ensurePriorityFields) {
      doc.ensurePriorityFieldsFirst();
    }
    return doc.toString();
  }

  static parse(text: string): ParsedFrontMatterTSV {
    const lines = text.split("\n");
    const meta: { [key: string]: string } = {};
    const rows: string[][] = [];
    let headers: string[] = [];
    let phase: "meta" | "header" | "data" = "meta";
    let metaLineCount = 0;

    for (const line of lines) {
      if (phase === "meta") {
        if (line === "---") {
          if (metaLineCount === 0) {
            metaLineCount++;
            continue;
          } else {
            phase = "header";
            continue;
          }
        }
        if (metaLineCount > 0 && line.trim()) {
          const colonIndex = line.indexOf(":");
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            meta[key] = value;
          }
        }
      } else if (phase === "header") {
        if (line.trim()) {
          headers = line.split("\t").map(unescapeCell);
          phase = "data";
        }
      } else if (phase === "data") {
        if (line.trim()) {
          rows.push(line.split("\t").map(unescapeCell));
        }
      }
    }

    return { meta, headers, rows };
  }

  static getFilesFromMeta(metaJson: string): { name: string; label: string }[] {
    const meta = JSON.parse(metaJson);
    const files: { name: string; label: string }[] = [];
    files.push({ name: "fields.tsv", label: "オブジェクト定義" });
    if (meta.queryJobs) {
      for (const job of meta.queryJobs) {
        files.push({
          name: job.fileName.replace(".json", ".tsv"),
          label: job.label,
        });
      }
    }
    return files;
  }
}
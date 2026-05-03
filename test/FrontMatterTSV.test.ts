import { FrontMatterTSV } from "../src/FrontMatterTSV";

describe("FrontMatterTSV", () => {
  describe("toString / parse (roundtrip)", () => {
    it("should roundtrip basic data", () => {
      const tsv = new FrontMatterTSV()
        .setMeta({ alias: "dev", retrievedAt: "2026/5/3 7:03:40" })
        .setHeaders(["ObjectName", "Label"])
        .addRow(["Account", "取引先"])
        .addRow(["Contact", "連絡先"]);

      const text = tsv.toString();
      const parsed = FrontMatterTSV.parse(text);

      expect(parsed.meta).toEqual({ alias: "dev", retrievedAt: "2026/5/3 7:03:40" });
      expect(parsed.headers).toEqual(["ObjectName", "Label"]);
      expect(parsed.rows).toEqual([
        ["Account", "取引先"],
        ["Contact", "連絡先"],
      ]);
    });

    it("should escape tab and newline in cells", () => {
      const tsv = new FrontMatterTSV()
        .setMeta({ alias: "dev" })
        .setHeaders(["Value"])
        .addRow(["test\ttab"])
        .addRow(["test\nnewline"])
        .addRow(["test\tboth\tand\nmixed"]);

      const text = tsv.toString();
      const parsed = FrontMatterTSV.parse(text);

      expect(parsed.rows).toEqual([
        ["test\ttab"],
        ["test\nnewline"],
        ["test\tboth\tand\nmixed"],
      ]);
    });

    it("should handle empty meta", () => {
      const tsv = new FrontMatterTSV()
        .setHeaders(["Col1", "Col2"])
        .addRow(["A", "B"]);

      const text = tsv.toString();
      const parsed = FrontMatterTSV.parse(text);

      expect(parsed.meta).toEqual({});
      expect(parsed.headers).toEqual(["Col1", "Col2"]);
      expect(parsed.rows).toEqual([["A", "B"]]);
    });
  });

  describe("stringify", () => {
    it("should generate tsv with meta, headers, and rows", () => {
      const text = FrontMatterTSV.stringify(
        { alias: "dev", retrievedAt: "2026/5/3 7:03:40" },
        ["ObjectName", "Label"],
        [
          ["Account", "取引先"],
          ["Contact", "連絡先"],
        ],
      );

      const parsed = FrontMatterTSV.parse(text);

      expect(parsed.meta).toEqual({ alias: "dev", retrievedAt: "2026/5/3 7:03:40" });
      expect(parsed.headers).toEqual(["ObjectName", "Label"]);
      expect(parsed.rows).toEqual([
        ["Account", "取引先"],
        ["Contact", "連絡先"],
      ]);
    });
  });

  describe("parse", () => {
    it("should handle leading empty lines", () => {
      const text = `

---
alias: dev
---
ObjectName\tLabel
Account\t取引先`;

      const parsed = FrontMatterTSV.parse(text);

      expect(parsed.meta).toEqual({ alias: "dev" });
      expect(parsed.headers).toEqual(["ObjectName", "Label"]);
      expect(parsed.rows).toEqual([["Account", "取引先"]]);
    });

    it("should handle trailing empty lines", () => {
      const text = `---
alias: dev
---
ObjectName\tLabel
Account\t取引先

`;

      const parsed = FrontMatterTSV.parse(text);

      expect(parsed.meta).toEqual({ alias: "dev" });
      expect(parsed.headers).toEqual(["ObjectName", "Label"]);
      expect(parsed.rows).toEqual([["Account", "取引先"]]);
    });

    it("should handle both leading and trailing empty lines", () => {

      const text = `

---
alias: dev
---
ObjectName\tLabel
Account\t取引先

`;

      const parsed = FrontMatterTSV.parse(text);

      expect(parsed.meta).toEqual({ alias: "dev" });
      expect(parsed.headers).toEqual(["ObjectName", "Label"]);
      expect(parsed.rows).toEqual([["Account", "取引先"]]);
    });
  });
});
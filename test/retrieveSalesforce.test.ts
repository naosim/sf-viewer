import * as path from "path";
import { SfClient, IFileSaver, SobjectRepository, ObjectRepository } from "../src/execPromise";
import { RetrieveSalesforce } from "../src/retrieveSalesforce";

const outputDir = path.join(__dirname, "../output");
const retrievedAt = new Date();
const realSfClient = new SfClient("dev", outputDir, retrievedAt);

const realObjectRepository = new ObjectRepository(
  outputDir,
  "objects.json",
  "fields.json",
).init();

const realSobjectRepository = new SobjectRepository(
  outputDir,
  "sobject-list.json",
).init(realSfClient);

const mockFileSaver = {
  saveJson: jest.fn(),
} as unknown as IFileSaver;

const mockConfig = {
  alias: "dev",
  objectBlackList: [],
  queryJobs: [
    {
      fileName: "flows.json",
      query: "SELECT Id, Name, FlowLabel, ApiName, ProgressStatus, IsPaused, FlowType, FlowDefinition, CreatedDate, LastModifiedDate, foo FROM FlowRecord LIMIT 200",
      tooling: false,
      label: "フロー一覧（レコードとして）",
    },
  ],
};

describe("buildErrorMessage", () => {
  let retrieveSalesforce: RetrieveSalesforce;

  beforeEach(() => {
    retrieveSalesforce = new RetrieveSalesforce(
      realSfClient,
      mockConfig,
      mockFileSaver,
    );
  });

  it("should return error message with undefined columns for metadata type", async () => {
    const job = {
      query: "SELECT Id, Name, FlowLabel, ApiName, ProgressStatus, IsPaused, FlowType, FlowDefinition, CreatedDate, LastModifiedDate, foo FROM FlowRecord LIMIT 200",
      label: "フロー一覧（レコードとして）",
    };
    const objName = "FlowRecord";
    const dataType = "metadata";
    const err = { message: "test error" };

    const errorMsg = await retrieveSalesforce.buildErrorMessage(
      job,
      objName,
      dataType,
      err,
      realObjectRepository,
      realSobjectRepository,
    );

    expect(errorMsg).toContain("フロー一覧（レコードとして） の取得に失敗しました");
    expect(errorMsg).toContain("未定義のカラム: foo");
  });

  it("should return error message without undefined columns when all columns exist", async () => {
    const job = {
      query: "SELECT Id, Name FROM Account",
      label: "テストジョブ",
    };
    const objName = "Account";
    const dataType = "object";
    const err = { message: "test error" };

    const errorMsg = await retrieveSalesforce.buildErrorMessage(
      job,
      objName,
      dataType,
      err,
      realObjectRepository,
      realSobjectRepository,
    );

    expect(errorMsg).toContain("テストジョブ の取得に失敗しました");
    expect(errorMsg).not.toContain("未定義のカラム");
  });

  it("should return basic error message for other dataType", async () => {
    const job = {
      query: "SELECT Id FROM UnknownObject",
      label: "テストジョブ",
    };
    const objName = "UnknownObject";
    const dataType = "other";
    const err = { message: "test error" };

    const errorMsg = await retrieveSalesforce.buildErrorMessage(
      job,
      objName,
      dataType,
      err,
      realObjectRepository,
      realSobjectRepository,
    );

    expect(errorMsg).toContain("テストジョブ の取得に失敗しました");
    expect(errorMsg).not.toContain("未定義のカラム");
  });
});
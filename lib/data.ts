import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Company, Label, type CompanyId } from "./types";

const DATA_DIR = join(process.cwd(), "data");

export class DataMissingError extends Error {}

function readJson(file: string): unknown {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) throw new DataMissingError(`Missing data/${file}. The dataset has not been built yet.`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export type Dataset = {
  companies: Company[];
  labels: Label[];
  targets: Company[];
  candidatesFor: (target: Company) => Company[];
  byId: Map<CompanyId, Company>;
};

let cached: Dataset | undefined;

export function loadData(): Dataset {
  if (cached) return cached;
  const companies = z.array(Company).parse(readJson("companies.json"));
  const labels = z.array(Label).parse(readJson("labels.json"));
  cached = {
    companies,
    labels,
    targets: companies.filter((c) => c.role === "target"),
    // Targets list each other as partners, so every company except the target itself is a candidate.
    candidatesFor: (target) => companies.filter((c) => c.id !== target.id),
    byId: new Map(companies.map((c) => [c.id, c])),
  };
  return cached;
}

export function dataAvailable(): boolean {
  return existsSync(join(DATA_DIR, "companies.json")) && existsSync(join(DATA_DIR, "labels.json"));
}

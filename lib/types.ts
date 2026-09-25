import { z } from "zod";

export const CompanyId = z.string().min(1).brand<"CompanyId">();
export type CompanyId = z.infer<typeof CompanyId>;

export const Company = z.object({
  id: CompanyId,
  name: z.string(),
  domain: z.string(),
  role: z.enum(["target", "pool"]),
  description_anon: z.string(),
});
export type Company = z.infer<typeof Company>;

export const Label = z.object({
  target: CompanyId,
  candidate: CompanyId,
  label: z.enum(["partner", "competitor"]),
  source_url: z.string(),
  fetched_at: z.string(),
  evidence: z.string(),
});
export type Label = z.infer<typeof Label>;

// The one flag table. The UI chips, the agent prompt and the scorer all read it.
export const FLAGS = {
  competitor: {
    label: "Flagged as competitor",
    description: "Sells a product that substitutes for the target's to the same buyer.",
  },
  wrong_buyer: {
    label: "Flagged as wrong buyer",
    description: "Complementary product, but sold to a different buyer than the target's.",
  },
} as const;
export type Flag = keyof typeof FLAGS;
export const FLAG_IDS = Object.keys(FLAGS) as [Flag, ...Flag[]];

export type Evidence = { companyId: CompanyId; quote: string };

export type Recommendation = {
  candidateId: CompanyId;
  rank: number;
  fit: number;
  reason: string;
  flags: Flag[];
  evidence: Evidence[];
};

export type Recommender = (target: Company, pool: Company[]) => Promise<Recommendation[]>;

export type Problem =
  | { kind: "unknown_id"; id: string; where: "candidate" | "evidence" }
  | { kind: "bad_quote"; companyId: CompanyId; quote: string };

export type Profile = { sells: string; buyer: string };

export type Ranking = { recommendations: Recommendation[]; problems: Problem[]; profile?: Profile };

export const RECOMMENDERS = {
  baseline: { label: "Most similar (naive)" },
  wingman: { label: "Wingman" },
} as const;
export type RecommenderId = keyof typeof RECOMMENDERS;

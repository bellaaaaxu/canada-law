export type Jurisdiction = 'bc' | 'federal';

/** The citation contract (SPEC): every tool that returns provision text includes all of these fields. */
export type Citation = {
  jurisdiction: Jurisdiction;
  act_title: string; // "Employment Standards Act"
  act_citation: string; // "RSBC 1996, c. 113"
  act_id: string; // "96113_01" | "L-2"
  section: string; // "40"
  heading: string | null; // marginal note
  source_url: string; // an official page that opens directly
  current_to: string | null; // official "current to" date (ISO); null + warning when unavailable
  retrieved_at: string; // ISO time the text was retrieved from the official source
};

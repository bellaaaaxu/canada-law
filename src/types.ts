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

/** One find_act candidate. */
export type ActCandidate = {
  act_id: string;
  title: string;
  citation: string;
  type: 'act' | 'regulation';
  source_url: string;
  status?: 'current' | 'repealed or replaced' | 'unknown';
  note?: string;
};

/** One search_law result: the citation fields, a snippet and why it matched. */
export type SearchResult = Citation & { snippet: string; match: string[] };

/* Demo data and configuration. Everything here is sample data (all companies are fictional). */
window.GC = window.GC || {};

// Set this to a real sentence from your validation run, e.g. "We checked 60 postings: 38% looked like ghost jobs."
// While it is null the proof strip on the home page is hidden. Never invent a number.
GC.PROOF_STAT = null;

GC.RESULTS = {
  real: {
    id: "real", jobTitle: "Product Designer", company: "Brightwave", location: "Remote",
    score: 14, verdict: "Likely Real", confidence: "High",
    summary: "Listed on the careers page, posted 9 days ago, and describes specific tools and team.",
    signals: [
      { id: "careers", name: "Careers-page match", status: "good", detail: "Found on brightwave.com/careers", weight: 30 },
      { id: "age", name: "Posting age", status: "good", detail: "Posted 9 days ago", weight: 20 },
      { id: "reposts", name: "Reposts and duplicates", status: "good", detail: "No duplicates found", weight: 15 },
      { id: "description", name: "Description quality", status: "good", detail: "Names tools, team and level", weight: 15 },
      { id: "pay", name: "Pay transparency", status: "good", detail: "Salary range listed", weight: 10 },
      { id: "news", name: "Company hiring news", status: "good", detail: "No recent layoff news", weight: 10 }
    ],
    checkedAt: "2026-10-19T10:00:00Z"
  },
  uncertain: {
    id: "uncertain", jobTitle: "Marketing Manager", company: "Northfield Retail", location: "Chicago, IL",
    score: 52, verdict: "Uncertain", confidence: "Medium",
    summary: "The role is listed on the careers page, but it has been open for 63 days and gives no salary.",
    signals: [
      { id: "careers", name: "Careers-page match", status: "good", detail: "Found on northfieldretail.com/jobs", weight: 30 },
      { id: "age", name: "Posting age", status: "warning", detail: "Open for 63 days", weight: 20 },
      { id: "reposts", name: "Reposts and duplicates", status: "warning", detail: "Listed 2 times on other boards", weight: 15 },
      { id: "description", name: "Description quality", status: "warning", detail: "Generic duties, few specifics", weight: 15 },
      { id: "pay", name: "Pay transparency", status: "warning", detail: "No salary range listed", weight: 10 },
      { id: "news", name: "Company hiring news", status: "good", detail: "No recent layoff news", weight: 10 }
    ],
    checkedAt: "2026-10-19T10:00:00Z"
  },
  ghost: {
    id: "ghost", jobTitle: "Data Analyst", company: "Acme Corp", location: "Austin, TX",
    score: 78, verdict: "Likely Ghost", confidence: "Medium",
    summary: "Not found on the careers page, open for 74 days, and the company announced layoffs in March.",
    signals: [
      { id: "careers", name: "Careers-page match", status: "bad", detail: "Role not found on acme.com/careers", weight: 30 },
      { id: "age", name: "Posting age", status: "bad", detail: "Open for 74 days", weight: 20 },
      { id: "reposts", name: "Reposts and duplicates", status: "bad", detail: "Same role listed 4 times", weight: 15 },
      { id: "description", name: "Description quality", status: "warning", detail: "Very generic responsibilities", weight: 15 },
      { id: "pay", name: "Pay transparency", status: "warning", detail: "No salary range listed", weight: 10 },
      { id: "news", name: "Company hiring news", status: "bad", detail: "Layoffs reported in the last 6 months", weight: 10 }
    ],
    checkedAt: "2026-10-19T10:00:00Z"
  }
};

GC.NEXT_STEPS = {
  "Likely Real": "This posting looks active. Apply with confidence.",
  "Uncertain": "Apply, but do not wait. Look for a contact at the company.",
  "Likely Ghost": "Consider applying only if you can confirm the role with the company."
};

GC.STEPS = [
  "Reading the job posting",
  "Opening the employer's careers page",
  "Searching for this role on their site",
  "Looking for duplicate postings",
  "Checking recent hiring news",
  "Calculating your Ghost Score"
];

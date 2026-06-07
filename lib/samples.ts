// Real-feeling sample documents so judges can hit "Try a sample" and see the
// before/after instantly — the demo moment that wins rooms.
//
// Deadlines are generated RELATIVE TO TODAY so the live countdown always reads
// as a sensible, urgent-but-real number no matter when the demo is run.

export type Sample = { domain: string; label: string; text: string };

function fmt(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getSamples(): Sample[] {
  return [
    {
      domain: "medical",
      label: "Surprise ER bill",
      text: `MERCY GENERAL HOSPITAL — STATEMENT
Account #: MG-558210-7
Guarantor: [Patient]
Date of service: ${fmt(-30)} (Emergency Department)

Total charges: $8,420.00
Insurance paid: $0.00
Patient responsibility: $8,420.00

Status: Insurance processed as OUT OF NETWORK provider.
Balance due in full by ${fmt(18)}. Accounts unpaid after that date may be referred to collections.`,
    },
    {
      domain: "insurance",
      label: "Insurance denial (MRI)",
      text: `BlueShield Health Plan
Explanation of Benefits — NOTICE OF ADVERSE BENEFIT DETERMINATION

Member: [Member]    Member ID: BSX-4471902
Claim #: CLM-22841907
Date of service: ${fmt(-21)}

We have reviewed the request for: MRI, lumbar spine (CPT 72148).

DETERMINATION: DENIED.
Reason: Service does not meet the plan's criteria for medical necessity. Conservative treatment of less than 6 weeks documented.

If you disagree with this decision, you may request an internal appeal in writing. Your appeal must be received no later than ${fmt(40)}. You may also be entitled to an external review.`,
    },
    {
      domain: "benefits",
      label: "SNAP benefits reduction",
      text: `STATE DEPARTMENT OF HUMAN SERVICES
NOTICE OF ACTION — SNAP (Food Assistance)

Case #: 7741-22-0098
Date: ${fmt(-3)}

This notice is to inform you that your monthly SNAP benefit amount will be REDUCED from $291 to $94 effective ${fmt(25)}.

Reason: Our records indicate a change in reported household income. Your reported earned income exceeds the gross income limit for your household size.

You have the right to request a fair hearing if you believe this decision is wrong. Your request must be made before ${fmt(80)}. If you request a hearing before ${fmt(25)}, your benefits may continue at the current level until a decision is made.`,
    },
    {
      domain: "financial_aid",
      label: "Financial-aid offer",
      text: `STATE UNIVERSITY — OFFICE OF FINANCIAL AID
2026–2027 AWARD NOTIFICATION

Student: [Student]    Student ID: SU-1180462
Reference: FA-2627-1180462

Based on your FAFSA, your aid offer for the year is:
  Federal Pell Grant: $3,200
  Subsidized Loan: $3,500
  Remaining estimated cost you must cover: $14,800

If your family's financial situation has changed since you filed, you may submit a special-circumstances appeal for a professional-judgment review. Appeals must be submitted by ${fmt(60)}.`,
    },
  ];
}

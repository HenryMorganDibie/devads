"use client";

import { Suspense } from "react";
import { OpportunityFlow } from "../../../components/OpportunityFlow";

const STEPS = [
  {
    title: "An opportunity is selected on the server",
    body: "When you are opted in, DevAds picks one eligible opportunity for your client and records that it was shown. Your tool never decides what you see or what you earn.",
  },
  {
    title: "It is always labelled",
    body: "Every opportunity names who is behind it. In the developer beta that is always DevAds itself, labelled “DevAds Beta Opportunity”. There are no external sponsors yet.",
  },
  {
    title: "You choose whether to engage",
    body: "Opening, skipping or ignoring an opportunity is up to you. Nothing interrupts your work, and you can opt out at any time.",
  },
  {
    title: "A real action, verified by the server",
    body: "A reward requires the opportunity's qualifying action. DevAds checks it against its own records (for this walkthrough: that you opened it at least the required time ago) and enforces caps and budgets.",
  },
  {
    title: "An auditable ledger entry",
    body: "A verified completion writes exactly one ledger entry, labelled with its source. Retries and duplicate submissions cannot pay twice, and nothing in the browser can change your balance.",
  },
  {
    title: "Your work stays private",
    body: "DevAds only sees coarse events such as shown, opened and completed. No source code. No prompts. No model responses. No secrets.",
  },
];

function Steps() {
  return (
    <ol className="space-y-4 mb-10">
      {STEPS.map((s, i) => (
        <li key={s.title} className="card p-5">
          <p className="text-xs font-mono text-accent mb-1">Step {i + 1}</p>
          <h2 className="font-medium mb-1">{s.title}</h2>
          <p className="text-sm text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export default function BetaOpportunityPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] rounded border border-accent/40 text-accent px-1.5 py-0.5">
        DevAds Beta Opportunity
      </span>
      <h1 className="text-2xl font-semibold mt-4 mb-2">How sponsored developer experiences work</h1>
      <p className="text-sm text-muted mb-8">
        A short walkthrough of the DevAds flow, run and funded by DevAds as part of the developer beta. No external
        sponsor is involved.
      </p>
      <Suspense>
        <OpportunityFlow>
          <Steps />
        </OpportunityFlow>
      </Suspense>
    </main>
  );
}

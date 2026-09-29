/**
 * Structured domain events for the sponsorship and reward domain.
 *
 * Fields are restricted to primitives, and callers pass only identifiers,
 * reward types, unit counts, statuses and machine-readable reasons. Never
 * pass request bodies, free text a developer or sponsor typed, prompts,
 * source code, file paths, credentials or tokens.
 *
 * Off by default. DOMAIN_EVENT_LOG=stdout writes one JSON line per event;
 * tests install their own sink with setDomainEventSink().
 */

export type DomainEventFields = Record<string, string | number | boolean | null>;
export interface DomainEvent extends DomainEventFields {
  event: string;
  at: string;
}
export type DomainEventSink = (event: DomainEvent) => void;

const stdoutSink: DomainEventSink = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

let sink: DomainEventSink | null = process.env.DOMAIN_EVENT_LOG === "stdout" ? stdoutSink : null;

/** Replaces the sink (null disables). Returns the previous one so tests can restore it. */
export function setDomainEventSink(next: DomainEventSink | null): DomainEventSink | null {
  const previous = sink;
  sink = next;
  return previous;
}

export function emitDomainEvent(event: string, fields: DomainEventFields = {}): void {
  if (!sink) return;
  try {
    sink({ ...fields, event, at: new Date().toISOString() });
  } catch {
    // Observability must never break a request.
  }
}

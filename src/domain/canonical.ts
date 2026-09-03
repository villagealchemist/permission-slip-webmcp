import {
  INTAKE_FIELD_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUIRED_FIELD_NAMES,
  type DisclosureSnapshot,
  type IntakeDraft,
  type IntakeFieldName,
  type OptionalDisclosureAuthorizations,
  type OptionalFieldName,
} from './types'

/** Disclosure payload plus the policy decisions needed to explain it. */
export interface DisclosureSnapshotDetails {
  snapshot: DisclosureSnapshot
  disclosedFields: IntakeFieldName[]
  authorizedOptionalFields: OptionalFieldName[]
  withheldOptionalFields: OptionalFieldName[]
}

/**
 * Applies authorization as a projection over a complete draft. Optional values
 * may remain locally editable while still being absent from the disclosure.
 */
export function buildDisclosureSnapshot(
  completeDraft: DisclosureSnapshot,
  authorizations: OptionalDisclosureAuthorizations,
): DisclosureSnapshotDetails {
  const snapshot: DisclosureSnapshot = {
    contactName: completeDraft.contactName,
    email: completeDraft.email,
    eventType: completeDraft.eventType,
    preferredDate: completeDraft.preferredDate,
    estimatedAttendeeCount: completeDraft.estimatedAttendeeCount,
    eventGoal: completeDraft.eventGoal,
  }

  const authorizedOptionalFields = OPTIONAL_FIELD_NAMES.filter(
    (field) => authorizations[field],
  )

  for (const field of authorizedOptionalFields) {
    const value = completeDraft[field]
    if (value !== undefined) {
      snapshot[field] = value
    }
  }

  const disclosedFields = INTAKE_FIELD_NAMES.filter(
    (field) => snapshot[field] !== undefined,
  )
  const withheldOptionalFields = OPTIONAL_FIELD_NAMES.filter(
    (field) => snapshot[field] === undefined,
  )

  return {
    snapshot,
    disclosedFields,
    authorizedOptionalFields,
    withheldOptionalFields,
  }
}

/**
 * Produces the single stable field ordering used for review comparison and
 * digest input, avoiding object insertion-order differences across callers.
 */
export function canonicalSerialize(snapshot: DisclosureSnapshot): string {
  const orderedEntries = INTAKE_FIELD_NAMES.flatMap((field) => {
    const value = snapshot[field]
    return value === undefined ? [] : [[field, value] as const]
  })

  return JSON.stringify(Object.fromEntries(orderedEntries))
}

/**
 * Creates a consistency digest for the canonical review payload. The digest
 * binds snapshots for comparison; it does not prove identity or secure storage.
 */
export async function sha256Digest(canonicalSnapshot: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable in this browser.')
  }

  const bytes = new TextEncoder().encode(canonicalSnapshot)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * Reapplies current authorizations before comparing with a review, so a policy
 * change invalidates approval even when the underlying draft values did not.
 */
export function hasSameDisclosure(
  draft: IntakeDraft,
  authorizations: OptionalDisclosureAuthorizations,
  reviewSnapshot: DisclosureSnapshot,
): boolean {
  const requiredPresent = REQUIRED_FIELD_NAMES.every(
    (field) => draft[field] !== undefined,
  )
  if (!requiredPresent) {
    return false
  }

  return canonicalSerialize(reviewSnapshot) === canonicalSerialize(
    buildDisclosureSnapshot(draft as DisclosureSnapshot, authorizations).snapshot,
  )
}
